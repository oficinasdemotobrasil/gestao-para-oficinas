/**
 * A rotina que avisa quem está para acabar o teste.
 *
 * Roda uma vez por dia (ou mais, sem prejuízo). Para cada marco — 3 dias e
 * 1 dia —, pergunta ao banco quem ainda precisa ser avisado e manda.
 *
 * O que faz esta rotina ser segura de repetir: quem decide a fila é o banco,
 * pela referência do envio (`vencimento|marco`). Rodar duas vezes no mesmo dia
 * não manda nada duas vezes; e um envio que falhou continua na fila amanhã, em
 * vez de se perder para sempre. Não há estado aqui dentro.
 *
 * O texto usa os dias que REALMENTE faltam, não o marco. Um aviso de 3 dias
 * que só conseguiu sair no dia seguinte precisa dizer "faltam 2 dias" — senão
 * o e-mail mente para o cliente.
 *
 * Deploy:
 *   npx supabase functions deploy avisos-diarios
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cabecalhosCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Quantos dias antes avisar. Do mais distante para o mais próximo. */
const MARCOS = [3, 1]

interface NaFila {
  oficina_id: string
  oficina_nome: string
  responsavel_nome: string
  responsavel_email: string
  acesso_ate: string
  dias_restantes: number
  referencia: string
}

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cabecalhosCors, 'Content-Type': 'application/json' },
  })
}

const emDataBrasileira = (iso: string) => {
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cabecalhosCors })
  if (req.method !== 'POST') return responder({ erro: 'Método não permitido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const chaveServico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Mesma porta fechada da função de e-mails: só o servidor entra.
  const autorizacao = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (autorizacao !== chaveServico) return responder({ erro: 'Não autorizado.' }, 401)

  const servico = createClient(url, chaveServico, { auth: { persistSession: false } })

  const enviados: string[] = []
  const falhas: string[] = []

  for (const marco of MARCOS) {
    const { data, error } = await servico.rpc('oficinas_para_avisar', { p_marco: marco })
    if (error) return responder({ erro: `fila do marco ${marco}: ${error.message}` }, 500)

    for (const linha of (data ?? []) as NaFila[]) {
      const resposta = await fetch(`${url}/functions/v1/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${chaveServico}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tipo: 'teste_terminando',
          oficina_id: linha.oficina_id,
          referencia: linha.referencia,
          dados: {
            dias_restantes: linha.dias_restantes,
            acesso_ate: emDataBrasileira(linha.acesso_ate),
          },
        }),
      })
      const corpo = await resposta.json().catch(() => ({}))
      // A função de e-mails já registrou a tentativa, com sucesso ou sem.
      // Aqui só montamos o resumo de quem chamou a rotina.
      if (resposta.ok && corpo.ok) enviados.push(`${linha.oficina_nome} (${linha.dias_restantes}d)`)
      else falhas.push(`${linha.oficina_nome}: ${corpo.erro ?? resposta.status}`)
    }
  }

  return responder({
    ok: falhas.length === 0,
    enviados,
    falhas,
    // Quem falhou hoje continua na fila amanhã. É de propósito, e é a razão de
    // esta rotina não ter fila própria nem nova tentativa aqui dentro.
    observacao: falhas.length > 0 ? 'as falhas voltam para a fila na próxima execução' : undefined,
  })
})
