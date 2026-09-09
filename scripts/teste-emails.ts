/**
 * Manda os cinco e-mails para você conferir com os próprios olhos.
 *
 * Não existe teste automático que diga se um e-mail está bom. Dá para provar
 * que a função respondeu 200; não dá para provar que o texto faz sentido para
 * um dono de oficina às sete da manhã. Então este script existe para uma coisa
 * só: colocar os cinco na sua caixa de entrada.
 *
 * Enquanto não há domínio verificado, o provedor só entrega para o e-mail da
 * conta. É por isso que o destino é fixo aqui.
 *
 *   npm run teste:emails
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
if (!URL || !SERVICO) {
  console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.test.local.')
  process.exit(1)
}

/** Sem domínio verificado, o provedor só entrega para o dono da conta. */
const DESTINO = process.argv[2] ?? 'oficinasdemotobrasil@gmail.com'

const admin = createClient(URL, SERVICO, { auth: { persistSession: false } })

/** Fica na cidade, fora dos e-mails, e é por onde a limpeza acha o que sobrou. */
const MARCA_DE_TESTE = '[teste-emails]'

let passou = 0
let falhou = 0
const ok = (n: string, d = '') => { passou++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? ` (${d})` : ''}`) }
const erro = (n: string, d: string) => { falhou++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`) }

const emDias = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('pt-BR')
}

const CASOS = [
  { tipo: 'boas_vindas', dados: {} },
  { tipo: 'teste_terminando', dados: { dias_restantes: 3, acesso_ate: emDias(3) } },
  { tipo: 'teste_terminando', dados: { dias_restantes: 1, acesso_ate: emDias(1) }, rotulo: 'último dia' },
  // O dia zero existe: a janela inclui quem vence hoje. "Faltam 0 dias" não é
  // português, e é o tipo de frase que denuncia que ninguém leu antes de mandar.
  { tipo: 'teste_terminando', dados: { dias_restantes: 0, acesso_ate: emDias(0) }, rotulo: 'vence hoje' },
  { tipo: 'pagamento_confirmado', dados: { valor: 89.9, proxima_cobranca: emDias(30) } },
  { tipo: 'pagamento_atrasado', dados: { dias_de_carencia: 7 } },
  { tipo: 'conta_bloqueada', dados: {} },
] as const

/**
 * Uma oficina só para este teste.
 *
 * A primeira versão usava a oficina que já existia no banco — a do cliente — e
 * deixava sete linhas de registro de envio no dado dele. Registro de e-mail
 * aparece na tela do dono; sujeira de teste ali é sujeira na casa do outro.
 */
async function montarCenario() {
  const marca = Date.now()
  const email = `emails.teste.${marca}@example.com`
  const { data: oficina, error } = await admin
    .from('oficinas')
    // O nome vai dentro do e-mail, então precisa ser um nome de verdade — é
    // o texto que você vai julgar. A marca de teste fica na cidade, que os
    // modelos não mostram, e é por ela que a limpeza encontra sobras.
    .insert({ nome: 'Oficina do Tião', cidade: MARCA_DE_TESTE, plano: 'completo' })
    .select().single()
  if (error || !oficina) throw new Error(`oficina: ${error?.message}`)

  const { data: conta, error: eConta } = await admin.auth.admin.createUser({
    email, password: `Emails!${marca}`, email_confirm: true,
  })
  if (eConta || !conta.user) throw new Error(`conta: ${eConta?.message}`)
  await admin.from('usuarios').insert({
    id: conta.user.id, oficina_id: oficina.id, nome: 'Tião Carvalho',
    email, perfil: 'admin', ativo: true,
  })
  return { oficinaId: oficina.id as string, nome: oficina.nome as string, contaId: conta.user.id }
}

async function main() {
  console.log('\n\x1b[1mOs e-mails do sistema\x1b[0m')
  console.log(`  para: ${DESTINO}`)

  let cenario: Awaited<ReturnType<typeof montarCenario>> | null = null
  try {
    cenario = await montarCenario()
  } catch (e) {
    erro('cenário', (e as Error).message)
    process.exit(1)
  }
  const oficina = { id: cenario.oficinaId, nome: cenario.nome }
  console.log(`  como: ${oficina.nome}\n`)

  for (const caso of CASOS) {
    const resposta = await fetch(`${URL}/functions/v1/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICO}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: caso.tipo,
        oficina_id: oficina.id,
        para: DESTINO,
        dados: caso.dados,
      }),
    })
    const corpo = await resposta.json().catch(() => ({}))
    const nome = 'rotulo' in caso ? `${caso.tipo} (${caso.rotulo})` : caso.tipo
    resposta.ok && corpo.ok
      ? ok(nome, corpo.assunto)
      : erro(nome, corpo.erro ?? `HTTP ${resposta.status}`)
  }

  // A porta fechada: sem a chave de serviço, ninguém manda e-mail em nome do
  // sistema. Vale medir, porque um endpoint de e-mail aberto vira máquina de
  // spam com o SEU domínio na assinatura.
  const semChave = await fetch(`${URL}/functions/v1/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY ?? 'nada'}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tipo: 'boas_vindas', oficina_id: oficina.id, para: DESTINO }),
  })
  semChave.status === 401
    ? ok('com a chave do navegador, a função recusa', 'ninguém manda e-mail em nome do sistema')
    : erro('porta aberta', `respondeu ${semChave.status} para a chave publicável`)

  // E o registro, que é o que responde ao "não recebi".
  const { data: registro } = await admin
    .from('emails_enviados')
    .select('tipo, destinatario, enviado, erro')
    .eq('oficina_id', oficina.id)
    .order('criado_em', { ascending: false })
    .limit(CASOS.length)
  // O registro guarda o sucesso E a falha. Quando falha, o que interessa é o
  // motivo uma vez — não a mesma mensagem repetida sete vezes na tela.
  const naoSairam = (registro ?? []).filter((r) => !r.enviado)
  if (registro?.length !== CASOS.length) {
    erro('registro', `esperava ${CASOS.length} linhas, veio ${registro?.length ?? 0}`)
  } else if (naoSairam.length === 0) {
    ok(`os ${registro.length} envios ficaram registrados`)
  } else {
    erro(
      `${naoSairam.length} de ${registro.length} não saíram`,
      `o registro guardou o motivo: ${String(naoSairam[0].erro).slice(0, 120)}`,
    )
  }

  // Limpeza -------------------------------------------------------------------
  await admin.from('emails_enviados').delete().eq('oficina_id', oficina.id)
  await limparOficina(admin, oficina.id)
  await admin.from('oficinas').delete().eq('id', oficina.id)
  await admin.auth.admin.deleteUser(cenario.contaId)
  const { data: sobrou } = await admin
    .from('oficinas').select('nome').eq('cidade', MARCA_DE_TESTE)
  sobrou?.length === 0
    ? ok('limpeza: nada ficou para trás')
    : erro('limpeza', JSON.stringify(sobrou))

  console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
  console.log(`\nAbra a caixa de entrada e confira os ${CASOS.length}: texto, botão e se o link abre o app.`)
  process.exit(falhou > 0 ? 1 : 0)
}

void main()
