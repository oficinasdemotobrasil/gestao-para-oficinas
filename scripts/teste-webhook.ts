/**
 * O webhook da cobrança, de ponta a ponta, sem cobrança nenhuma.
 *
 * Dispara eventos como o provedor dispararia — mesmo cabeçalho, mesmo formato
 * de corpo — contra a função publicada, e confere no banco o que mudou.
 *
 * A diferença para um script genérico de disparo: aqui a oficina de teste
 * nasce com o identificador de cliente que vai vir no evento. Sem essa amarra,
 * o webhook registra e responde "não achei a oficina" — correto, e sem provar
 * nada sobre o que acontece quando o dinheiro entra.
 *
 * Precisa do token, que não fica em arquivo:
 *   export ASAAS_WEBHOOK_TOKEN='...'
 *   npm run teste:webhook
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { limparOficina } from './limpar-teste'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
config({ path: path.join(raiz, '.env.test.local'), quiet: true })
config({ path: path.join(raiz, '.env.local'), quiet: true })

const URL = process.env.SUPABASE_URL
const SERVICO = process.env.SUPABASE_SERVICE_ROLE_KEY
const TOKEN = process.env.ASAAS_WEBHOOK_TOKEN

if (!URL || !SERVICO) {
  console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.test.local.')
  process.exit(1)
}
if (!TOKEN) {
  console.error(
    'Falta o token do webhook. Ele não fica em arquivo — exporte antes de rodar:\n\n' +
      "  export ASAAS_WEBHOOK_TOKEN='o mesmo valor do Secret no Supabase'\n",
  )
  process.exit(1)
}

const admin = createClient(URL, SERVICO, { auth: { persistSession: false } })
const ENDERECO = `${URL}/functions/v1/asaas-webhook`

let passou = 0
let falhou = 0
const ok = (n: string, d = '') => { passou++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? ` (${d})` : ''}`) }
const erro = (n: string, d: string) => { falhou++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`) }

const MARCA = Date.now()
const CLIENTE_EXTERNO = `cus_teste_${MARCA}`
const ASSINATURA_EXTERNA = `sub_teste_${MARCA}`

const emDias = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

async function disparar(
  evento: Record<string, unknown>,
  token: string | null = TOKEN!,
): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const cabecalhos: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) cabecalhos['asaas-access-token'] = token
  const resposta = await fetch(ENDERECO, {
    method: 'POST',
    headers: cabecalhos,
    body: JSON.stringify(evento),
  })
  return { status: resposta.status, corpo: await resposta.json().catch(() => ({})) }
}

const pagamento = (extras: Record<string, unknown> = {}) => ({
  id: `pay_teste_${MARCA}`,
  customer: CLIENTE_EXTERNO,
  subscription: ASSINATURA_EXTERNA,
  value: 49.99,
  ...extras,
})

async function oficinaAgora(id: string) {
  const { data } = await admin
    .from('oficinas').select('acesso_ate, status, plano').eq('id', id).single()
  return data!
}

async function main() {
  console.log('\n\x1b[1mO webhook da cobrança, sem cobrança nenhuma\x1b[0m')
  console.log(`  ${ENDERECO}\n`)

  // Depois de criada, a oficina existe até o fim: os passos seguintes contam
  // com ela, e deixar o tipo anulável espalharia `!` por toda a função.
  let oficinaId = ''
  let contaId = ''

  try {
    // A porta, antes de qualquer coisa ------------------------------------------
    const semToken = await disparar({ event: 'PAYMENT_CONFIRMED', payment: pagamento() }, null)
    semToken.status === 401
      ? ok('sem token, a porta não abre')
      : erro('sem token', `respondeu ${semToken.status}`)

    const tokenErrado = await disparar(
      { event: 'PAYMENT_CONFIRMED', payment: pagamento() },
      'token-de-mentira',
    )
    tokenErrado.status === 401
      ? ok('com token errado, também não')
      : erro('token errado', `respondeu ${tokenErrado.status}`)

    // Evento de um cliente que não conhecemos -----------------------------------
    const desconhecido = await disparar({
      event: 'PAYMENT_CONFIRMED',
      id: `evt_orfao_${MARCA}`,
      payment: { id: 'pay_orfao', customer: 'cus_que_nao_existe', value: 10 },
    })
    desconhecido.status === 200 && desconhecido.corpo.aplicado === false
      ? ok('evento sem dono é registrado e não aplicado', String(desconhecido.corpo.motivo))
      : erro('evento órfão', JSON.stringify(desconhecido))

    // A oficina, com o identificador que vem no evento --------------------------
    const { data: of, error: eOf } = await admin
      .from('oficinas')
      .insert({ nome: 'Oficina da Cobrança', cidade: '[teste-webhook]', plano: 'completo' })
      .select().single()
    if (eOf || !of) throw new Error(`oficina: ${eOf?.message}`)
    oficinaId = of.id

    const email = `webhook.teste.${MARCA}@example.com`
    const { data: conta } = await admin.auth.admin.createUser({
      email, password: `Webhook!${MARCA}`, email_confirm: true,
    })
    contaId = conta.user!.id
    await admin.from('usuarios').insert({
      id: contaId, oficina_id: oficinaId, nome: 'Dona', email, perfil: 'admin', ativo: true,
    })
    await admin.from('assinaturas').insert({
      oficina_id: oficinaId,
      plano: 'completo',
      situacao: 'ativa',
      id_externo_cliente: CLIENTE_EXTERNO,
      id_externo_assinatura: ASSINATURA_EXTERNA,
    })
    // Vencida há dez dias: bloqueada. É o estado de quem vai pagar.
    await admin.from('oficinas').update({ acesso_ate: emDias(-10) }).eq('id', oficinaId)
    const { data: antes } = await admin.rpc('situacao_da_oficina', { p_oficina: oficinaId })
    antes === 'bloqueada'
      ? ok('a oficina de teste começa bloqueada, com o pagamento vencido')
      : erro('estado inicial', String(antes))

    // O dinheiro entra ----------------------------------------------------------
    const proxima = emDias(30)
    const confirmado = await disparar({
      event: 'PAYMENT_CONFIRMED',
      id: `evt_pago_${MARCA}`,
      payment: pagamento({ nextDueDate: proxima, dueDate: emDias(-10), status: 'CONFIRMED' }),
    })
    const depois = await oficinaAgora(oficinaId)
    confirmado.corpo.aplicado === true && depois.acesso_ate === proxima
      ? ok('pagamento confirmado move o acesso para a próxima cobrança', proxima)
      : erro('pagamento', JSON.stringify({ resposta: confirmado.corpo, depois }))

    const { data: agora } = await admin.rpc('situacao_da_oficina', { p_oficina: oficinaId })
    agora === 'ativa'
      ? ok('e a oficina volta a ser ativa na hora')
      : erro('situação após pagamento', String(agora))

    // O mesmo evento de novo ----------------------------------------------------
    const repetido = await disparar({
      event: 'PAYMENT_CONFIRMED',
      id: `evt_pago_${MARCA}`,
      payment: pagamento({ nextDueDate: emDias(999), status: 'CONFIRMED' }),
    })
    const semMudanca = await oficinaAgora(oficinaId)
    repetido.corpo.repetido === true && semMudanca.acesso_ate === proxima
      ? ok('o mesmo evento reenviado não aplica de novo', 'nem com data diferente dentro')
      : erro('reenvio', JSON.stringify({ resposta: repetido.corpo, depois: semMudanca }))

    // RECEIVED depois de CONFIRMED, que é o par que preocupava -------------------
    const recebido = await disparar({
      event: 'PAYMENT_RECEIVED',
      id: `evt_recebido_${MARCA}`,
      payment: pagamento({ nextDueDate: proxima, status: 'RECEIVED' }),
    })
    const aposRecebido = await oficinaAgora(oficinaId)
    recebido.corpo.aplicado === true && aposRecebido.acesso_ate === proxima
      ? ok('CONFIRMED e RECEIVED na mesma cobrança dão o mesmo resultado', 'a operação é absoluta')
      : erro('recebido', JSON.stringify({ resposta: recebido.corpo, depois: aposRecebido }))

    // Sem a data da próxima cobrança --------------------------------------------
    const semProxima = await disparar({
      event: 'PAYMENT_CONFIRMED',
      id: `evt_sem_proxima_${MARCA}`,
      payment: pagamento({ dueDate: emDias(-3), status: 'CONFIRMED' }),
    })
    const contado = await oficinaAgora(oficinaId)
    const esperado = emDias(27) // 30 dias a partir do vencimento, não de hoje
    semProxima.corpo.aplicado === true && contado.acesso_ate === esperado
      ? ok('sem a próxima data, conta 30 dias do vencimento pago', 'quem paga atrasado não perde os dias')
      : erro('30 dias', JSON.stringify({ obtido: contado.acesso_ate, esperado }))

    // Atraso só registra ---------------------------------------------------------
    const atrasado = await disparar({
      event: 'PAYMENT_OVERDUE',
      id: `evt_atraso_${MARCA}`,
      payment: pagamento({ status: 'OVERDUE' }),
    })
    const aposAtraso = await oficinaAgora(oficinaId)
    atrasado.corpo.aplicado === false && aposAtraso.acesso_ate === esperado
      ? ok('atraso é só registrado — a situação já vem das datas')
      : erro('atraso', JSON.stringify({ resposta: atrasado.corpo, depois: aposAtraso }))

    const estorno = await disparar({
      event: 'PAYMENT_REFUNDED',
      id: `evt_estorno_${MARCA}`,
      payment: pagamento({ status: 'REFUNDED' }),
    })
    const aposEstorno = await oficinaAgora(oficinaId)
    estorno.corpo.aplicado === false && aposEstorno.acesso_ate === esperado
      ? ok('estorno não tira acesso sozinho — fica para uma pessoa decidir')
      : erro('estorno', JSON.stringify({ resposta: estorno.corpo, depois: aposEstorno }))

    // A assinatura acaba ---------------------------------------------------------
    const encerrada = await disparar({
      event: 'SUBSCRIPTION_DELETED',
      id: `evt_fim_${MARCA}`,
      subscription: { id: ASSINATURA_EXTERNA, customer: CLIENTE_EXTERNO },
    })
    const { data: assinatura } = await admin
      .from('assinaturas').select('situacao').eq('oficina_id', oficinaId).single()
    const aposFim = await oficinaAgora(oficinaId)
    encerrada.corpo.aplicado === true &&
    assinatura?.situacao === 'encerrada' &&
    aposFim.acesso_ate === esperado
      ? ok('cancelar encerra a assinatura e NÃO tira o acesso', 'vale até o fim do período pago')
      : erro('cancelamento', JSON.stringify({ assinatura, depois: aposFim }))

    // O registro bruto ------------------------------------------------------------
    const { data: eventos } = await admin
      .from('eventos_asaas').select('tipo, aplicado').eq('oficina_id', oficinaId)
    ;(eventos?.length ?? 0) >= 6
      ? ok(`os ${eventos!.length} eventos ficaram guardados como chegaram`)
      : erro('registro', JSON.stringify(eventos))
  } catch (e) {
    erro('execução', (e as Error).message)
  } finally {
    if (oficinaId) {
      await admin.from('eventos_asaas').delete().eq('oficina_id', oficinaId)
      await admin.from('assinaturas').delete().eq('oficina_id', oficinaId)
      await limparOficina(admin, oficinaId)
      await admin.from('oficinas').delete().eq('id', oficinaId)
    }
    if (contaId) await admin.auth.admin.deleteUser(contaId)
    await admin.from('eventos_asaas').delete().is('oficina_id', null)
    const { data: sobrou } = await admin
      .from('oficinas').select('nome').eq('cidade', '[teste-webhook]')
    sobrou?.length === 0
      ? ok('limpeza: nada ficou para trás')
      : erro('limpeza', JSON.stringify(sobrou))
  }

  console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
  process.exit(falhou > 0 ? 1 : 0)
}

void main()
