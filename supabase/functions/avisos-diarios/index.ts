/**
 * A rotina que avisa quem está para acabar o teste.
 *
 * Roda uma vez por dia (ou mais, sem prejuízo: no máximo um aviso por oficina
 * por dia). Para cada marco — 3 dias e 1 dia —, pergunta ao banco quem ainda
 * precisa ser avisado e manda.
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
 * Quem chama é o agendamento do Supabase (Integrations → Cron, todo dia às
 * 12:00 UTC = 9h em Recife), com a chave secreta no formato novo (sb_secret_).
 * Esse formato não é JWT, então a verificação automática do Supabase fica
 * DESLIGADA e a porta é esta função: `temPoderDeServico` recusa quem não tem
 * poder de serviço, com 401.
 *
 * Deploy (sem exigir JWT — ver acima):
 *   npx supabase functions deploy avisos-diarios --no-verify-jwt
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


/**
 * Quem chamou tem poder de serviço?
 *
 * Não comparamos a chave com a do ambiente. Parece o caminho óbvio e é
 * frágil: o Supabase injeta aqui a chave DELE, e o projeto pode ter tanto o
 * formato antigo (JWT) quanto o novo (sb_secret_). Duas strings diferentes
 * apontando para o mesmo poder fazem a comparação recusar quem tinha direito
 * — que foi exatamente o que aconteceu.
 *
 * Então perguntamos o que importa: esta chave consegue fazer algo que só a
 * service_role consegue? `plataforma_indicadores` tem o execute revogado de
 * anon e authenticated (migration 0046). Se responder, o poder existe.
 */
async function temPoderDeServico(url: string, token: string): Promise<boolean> {
  if (!token) return false
  try {
    const cliente = createClient(url, token, { auth: { persistSession: false } })
    const { error } = await cliente.rpc('plataforma_indicadores')
    return !error
  } catch {
    return false
  }
}

/**
 * O Edge Runtime do Supabase deixa uma tarefa continuar depois da resposta.
 * Fora dele (teste local), não existe — e aí a rotina roda antes de responder.
 */
declare const EdgeRuntime: { waitUntil(tarefa: Promise<unknown>): void } | undefined

/** A rodada inteira: os marcos, a fila de cada um e o envio. */
async function rodar(url: string, chaveServico: string) {
  const servico = createClient(url, chaveServico, { auth: { persistSession: false } })

  const enviados: string[] = []
  const falhas: string[] = []

  /**
   * Quem já recebeu nesta execução.
   *
   * Sem isto, uma oficina que nunca recebeu o aviso de 3 dias e chega no
   * último dia aparece nas DUAS filas — as referências são diferentes, então
   * o banco não impede — e leva dois e-mails idênticos no mesmo minuto.
   *
   * A alternativa seria gravar, num envio só, a referência de todos os marcos
   * acima. Não fiz assim de propósito: isso apagaria o aviso do último dia
   * para quem recebeu o de 3 dias faltando 1. Do jeito que está, ela recebe
   * hoje "termina amanhã" e amanhã "vence hoje" — que é a sequência certa.
   */
  const jaAvisadas = new Set<string>()

  /*
   * E quem já recebeu um aviso HOJE (dia de Recife), em qualquer rodada e por
   * qualquer marco, também não recebe outro. Sem isto, uma segunda rodada no
   * mesmo dia mandava o aviso de 1 dia a quem acabara de receber o de 3 dias
   * faltando 1 — o mesmo "termina amanhã", repetido. Foi o que aconteceu em
   * 07/10/2026, em dois testes seguidos: um cliente recebeu três cópias.
   * Recife não tem horário de verão: o dia começa às 03:00 UTC.
   */
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Recife' })
  const { data: avisadasHoje, error: erroDeHoje } = await servico
    .from('emails_enviados')
    .select('oficina_id')
    .eq('tipo', 'teste_terminando')
    .eq('enviado', true)
    .gte('criado_em', `${hoje}T03:00:00Z`)
  if (erroDeHoje) {
    // Sem saber quem já recebeu, é melhor não mandar nada do que repetir.
    falhas.push(`avisos de hoje: ${erroDeHoje.message}`)
    console.log(JSON.stringify({ rodada: 'avisos-diarios', enviados, falhas }))
    return { enviados, falhas }
  }
  for (const e of avisadasHoje ?? []) jaAvisadas.add(e.oficina_id as string)

  for (const marco of MARCOS) {
    const { data, error } = await servico.rpc('oficinas_para_avisar', { p_marco: marco })
    if (error) {
      falhas.push(`fila do marco ${marco}: ${error.message}`)
      continue
    }

    for (const linha of (data ?? []) as NaFila[]) {
      if (jaAvisadas.has(linha.oficina_id)) continue
      jaAvisadas.add(linha.oficina_id)

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

  // Aparece nos logs da função: é onde se vê a rodada que o Cron disparou.
  console.log(JSON.stringify({ rodada: 'avisos-diarios', enviados, falhas }))
  return { enviados, falhas }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cabecalhosCors })
  if (req.method !== 'POST') return responder({ erro: 'Método não permitido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const chaveServico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  /*
   * Mesma porta fechada da função de e-mails: só o servidor entra.
   *
   * A chave pode chegar por dois cabeçalhos. Quem chama à mão manda
   * `Authorization: Bearer`; o Cron do Supabase ("Add secret key") manda em
   * `apikey`. Qualquer um dos dois serve, desde que tenha poder de serviço.
   */
  const candidatas = [
    (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, ''),
    req.headers.get('apikey') ?? '',
  ].filter(Boolean)
  let autorizado = false
  for (const chave of candidatas) {
    if (await temPoderDeServico(url, chave)) {
      autorizado = true
      break
    }
  }
  if (!autorizado) return responder({ erro: 'Não autorizado.' }, 401)

  /*
   * O Cron espera no máximo 5 segundos pela resposta, e cada e-mail leva
   * perto de 1,5 s. Então, chamada pelo Cron, a rotina responde na hora e
   * envia em seguida, sem pressa — o resultado fica nos logs da função e no
   * registro de e-mails. Quem chama à mão e quer ver o resumo manda
   * {"esperar": true} no corpo.
   */
  const corpo = await req.json().catch(() => ({}))
  if (corpo?.esperar || typeof EdgeRuntime === 'undefined') {
    const { enviados, falhas } = await rodar(url, chaveServico)
    return responder({
      ok: falhas.length === 0,
      enviados,
      falhas,
      // Quem falhou hoje continua na fila amanhã. É de propósito, e é a razão
      // de esta rotina não ter fila própria nem nova tentativa aqui dentro.
      observacao: falhas.length > 0 ? 'as falhas voltam para a fila na próxima execução' : undefined,
    })
  }
  EdgeRuntime.waitUntil(rodar(url, chaveServico))
  return responder({ ok: true, iniciada: true }, 202)
})
