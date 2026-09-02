/**
 * Testa a fronteira de segurança da Edge Function gerar-texto-orcamento —
 * SEM gastar um único token do Gemini, porque a checagem de sessão e perfil
 * acontece antes da chamada à IA. Isso vale mesmo que GEMINI_API_KEY não
 * esteja configurada ainda: os testes daqui não dependem dela.
 *
 * O que fica de fora, de propósito: não valida o texto que o Gemini devolve.
 * Isso exigiria gastar a cota da oficina a cada rodada de teste, e o conteúdo
 * gerado varia — não há "resposta certa" para comparar.
 *
 *   npm run teste:ia
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { limparOficina, limparContasDeTeste } from './limpar-teste'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
config({ path: path.join(raiz, '.env.test.local'), quiet: true })
config({ path: path.join(raiz, '.env.local'), quiet: true })

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.VITE_SUPABASE_ANON_KEY

if (!URL || !SERVICE_ROLE || !ANON) {
  console.error('\nFaltam chaves. Veja .env.local.example.\n')
  process.exit(1)
}

const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } })
const FUNCAO = `${URL}/functions/v1/gerar-texto-orcamento`
const MARCA = Date.now()
const SENHA = `Teste!${randomUUID().slice(0, 10)}`

let passou = 0
let falhou = 0
const falhas: string[] = []

const ok = (nome: string, detalhe = '') => {
  passou++
  console.log(`  \x1b[32m✓\x1b[0m ${nome}${detalhe ? ` (${detalhe})` : ''}`)
}
const erro = (nome: string, detalhe: string) => {
  falhou++
  falhas.push(`${nome} — ${detalhe}`)
  console.log(`  \x1b[31m✗\x1b[0m ${nome}\n      ${detalhe}`)
}

async function chamar(corpo: unknown, token?: string) {
  const r = await fetch(FUNCAO, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON!,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(corpo),
  })
  let corpoResposta: Record<string, unknown> = {}
  try {
    corpoResposta = await r.json()
  } catch {
    /* sem corpo */
  }
  return { status: r.status, corpo: corpoResposta }
}

const ITEM_VALIDO = [{ descricao: 'Troca de óleo', tipo: 'servico', quantidade: 1, valor_unitario: 60 }]

async function entrar(email: string) {
  const c = createClient(URL!, ANON!, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: SENHA })
  if (error) throw new Error(`login falhou para ${email}: ${error.message}`)
  return data.session!.access_token
}

const oficinas: string[] = []

async function main() {
  console.log('\n\x1b[1mSegurança da Edge Function gerar-texto-orcamento\x1b[0m')
  console.log(`  ${FUNCAO}`)
  console.log('  (não chega a gastar Gemini: a checagem barra antes)')

  try {
    console.log('\n\x1b[1mSem sessão\x1b[0m')
    const semSessao = await chamar({ itens: ITEM_VALIDO, desconto: 0, total: 60 })
    semSessao.status === 401
      ? ok('recusa quem não está logado', `HTTP ${semSessao.status}`)
      : erro('recusa quem não está logado', `esperava 401, veio ${semSessao.status}`)

    console.log('\n\x1b[1mMontando oficina de teste\x1b[0m')
    const { data: of } = await admin
      .from('oficinas')
      .insert({ nome: `[teste ia ${MARCA}] Oficina` })
      .select()
      .single()
    oficinas.push(of.id)

    const emailAdmin = `teste.ia.${MARCA}.admin@example.com`
    const emailMecanico = `teste.ia.${MARCA}.mecanico@example.com`
    const { data: uAdmin } = await admin.auth.admin.createUser({ email: emailAdmin, password: SENHA, email_confirm: true })
    const { data: uMec } = await admin.auth.admin.createUser({ email: emailMecanico, password: SENHA, email_confirm: true })

    await admin.from('usuarios').insert([
      { id: uAdmin.user!.id, oficina_id: of.id, nome: 'Admin', email: emailAdmin, perfil: 'admin', ativo: true },
      { id: uMec.user!.id, oficina_id: of.id, nome: 'Mecânico', email: emailMecanico, perfil: 'mecanico', ativo: true },
    ])
    ok('oficina com admin e mecânico')

    const tokenAdmin = await entrar(emailAdmin)
    const tokenMecanico = await entrar(emailMecanico)

    console.log('\n\x1b[1mQuem pode chamar\x1b[0m')
    const comoMecanico = await chamar({ itens: ITEM_VALIDO, desconto: 0, total: 60 }, tokenMecanico)
    comoMecanico.status === 403
      ? ok('mecânico não gera texto de venda', `HTTP 403`)
      : erro('mecânico não gera texto de venda', `esperava 403, veio ${comoMecanico.status}: ${JSON.stringify(comoMecanico.corpo)}`)

    console.log('\n\x1b[1mValidação de entrada (não chega a chamar o Gemini)\x1b[0m')
    const semItens = await chamar({ itens: [], desconto: 0, total: 0 }, tokenAdmin)
    semItens.status === 400
      ? ok('recusa sem nenhum item', 'HTTP 400')
      : erro('recusa sem nenhum item', `esperava 400, veio ${semItens.status}`)

    const itemVazio = await chamar({ itens: [{ descricao: '   ' }], desconto: 0, total: 0 }, tokenAdmin)
    itemVazio.status === 400
      ? ok('recusa item com descrição em branco', 'HTTP 400')
      : erro('recusa item com descrição em branco', `esperava 400, veio ${itemVazio.status}`)
  } catch (e) {
    erro('execução do teste', (e as Error).message)
  } finally {
    console.log('\n\x1b[1mLimpeza\x1b[0m')
    const problemas: string[] = []
    for (const id of oficinas) problemas.push(...(await limparOficina(admin, id)))
    problemas.push(...(await limparContasDeTeste(admin, [`teste.ia.${MARCA}.`])))
    problemas.length === 0
      ? ok('oficina de teste removida')
      : erro('limpeza', `sobrou dado de teste: ${problemas.join('; ')}`)
  }

  console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
  if (falhas.length) {
    console.log('\nFalhas:')
    falhas.forEach((f) => console.log(`  - ${f}`))
  }
  process.exit(falhou === 0 ? 0 : 1)
}

void main()
