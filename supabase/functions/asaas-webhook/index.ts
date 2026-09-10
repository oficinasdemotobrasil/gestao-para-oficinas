/**
 * O webhook do provedor de pagamento.
 *
 * Esta é a única porta do sistema que o mundo inteiro alcança, então ela é
 * também a mais desconfiada. A ordem das operações não é acidental:
 *
 *   1. Confere o token. Sem ele, 401 e nada mais — nem log, nem leitura.
 *   2. Guarda o evento BRUTO, antes de interpretar. Se a interpretação
 *      quebrar, a cópia fiel do que chegou já está salva.
 *   3. Só então aplica.
 *
 * Idempotência: o `evento_id` é único na tabela. O Asaas reenvia quando não
 * recebe 200, e reenviar não pode cobrar nem liberar duas vezes. Além disso, a
 * operação aplicada é ABSOLUTA — "o acesso vale até tal dia" —, não um
 * incremento. Escrever a mesma data duas vezes dá no mesmo que escrever uma.
 *
 * Quase todos os eventos são só registrados. Isso é de propósito: a situação
 * da oficina é DERIVADA das datas (migration 0044), então "venceu" e "está
 * atrasado" já são consequência do calendário. O webhook só precisa mover a
 * data quando entra dinheiro.
 *
 * Estorno e chargeback também só registram. Tirar acesso automaticamente por
 * um estorno que pode ser erro do banco é o tipo de automação que dói quando
 * erra — fica visível no painel para uma pessoa decidir.
 *
 * Deploy (sem exigir JWT: quem chama é o Asaas, não um usuário):
 *   npx supabase functions deploy asaas-webhook --no-verify-jwt
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

/** Entram dinheiro: movem a data até quando o acesso vale. */
const PAGOU = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']
/** A assinatura acabou: o acesso segue até o fim do período já pago. */
const ACABOU = ['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED']

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Até quando o acesso passa a valer depois deste pagamento.
 *
 * Preferimos a data que o provedor manda para a próxima cobrança. Sem ela,
 * trinta dias a partir do vencimento pago — e não a partir de hoje: quem paga
 * com três dias de atraso não pode perder três dias.
 */
function ateQuando(pagamento: Record<string, unknown>): string {
  const proxima = pagamento.nextDueDate ?? pagamento.dueDate
  const base = typeof proxima === 'string' ? new Date(`${proxima}T12:00:00Z`) : new Date()
  if (!pagamento.nextDueDate) base.setDate(base.getDate() + 30)
  return base.toISOString().slice(0, 10)
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return responder({ erro: 'Método não permitido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const chaveServico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const tokenEsperado = Deno.env.get('ASAAS_WEBHOOK_TOKEN')

  if (!tokenEsperado) {
    // Sem token configurado a porta ficaria aberta. Melhor recusar tudo.
    return responder({ erro: 'Webhook não configurado.' }, 503)
  }

  const token = req.headers.get('asaas-access-token') ?? ''
  if (token !== tokenEsperado) return responder({ erro: 'Não autorizado.' }, 401)

  let evento: Record<string, unknown>
  try {
    evento = await req.json()
  } catch {
    return responder({ erro: 'Corpo inválido.' }, 400)
  }

  const servico = createClient(url, chaveServico, { auth: { persistSession: false } })

  const tipo = String(evento.event ?? 'DESCONHECIDO')
  const eventoId = String(evento.id ?? `${tipo}-${Date.now()}`)
  const pagamento = (evento.payment ?? evento.subscription ?? {}) as Record<string, unknown>

  // De quem é? Pelo cliente ou pela assinatura no provedor.
  let oficinaId: string | null = null
  const idCliente = pagamento.customer as string | undefined
  const idAssinatura = (pagamento.subscription ?? pagamento.id) as string | undefined

  if (idCliente) {
    const { data } = await servico
      .from('assinaturas').select('oficina_id')
      .eq('id_externo_cliente', idCliente).limit(1).maybeSingle()
    oficinaId = data?.oficina_id ?? null
  }
  if (!oficinaId && idAssinatura) {
    const { data } = await servico
      .from('assinaturas').select('oficina_id')
      .eq('id_externo_assinatura', idAssinatura).limit(1).maybeSingle()
    oficinaId = data?.oficina_id ?? null
  }

  // Guarda antes de interpretar. Se a aplicação falhar, o evento está salvo.
  const { error: erroRegistro } = await servico.from('eventos_asaas').insert({
    evento_id: eventoId,
    tipo,
    conteudo: evento,
    oficina_id: oficinaId,
    aplicado: false,
    observacao: oficinaId ? null : 'não foi possível descobrir a oficina',
  })

  // Chave duplicada: já recebemos este evento. Responder 200 é o certo — o
  // Asaas para de reenviar, e nada é aplicado duas vezes.
  if (erroRegistro) {
    const repetido = /duplicate key|unique/i.test(erroRegistro.message)
    return repetido
      ? responder({ ok: true, repetido: true })
      : responder({ erro: erroRegistro.message }, 500)
  }

  if (!oficinaId) {
    // Registrado e sem dono. Responder 200 evita reenvio infinito de algo que
    // não vai melhorar sozinho; o painel mostra que ficou pendente.
    return responder({ ok: true, aplicado: false, motivo: 'oficina não encontrada' })
  }

  let aplicado = false
  let observacao: string | null = null

  try {
    if (PAGOU.includes(tipo)) {
      const { error } = await servico.rpc('registrar_pagamento', {
        p_oficina: oficinaId,
        p_acesso_ate: ateQuando(pagamento),
        p_plano: null,
      })
      if (error) throw error
      aplicado = true
      observacao = `acesso até ${ateQuando(pagamento)}`
    } else if (ACABOU.includes(tipo)) {
      const { error } = await servico.rpc('encerrar_assinatura', {
        p_oficina: oficinaId,
        p_motivo: 'encerrada no provedor',
      })
      if (error) throw error
      aplicado = true
      observacao = 'assinatura encerrada; acesso segue até o fim do período pago'
    } else {
      observacao = 'registrado, sem ação — a situação vem das datas'
    }
  } catch (e) {
    observacao = `falhou ao aplicar: ${(e as Error).message}`
  }

  await servico
    .from('eventos_asaas')
    .update({ aplicado, observacao })
    .eq('evento_id', eventoId)

  return responder({ ok: true, tipo, aplicado, observacao })
})
