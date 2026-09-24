/**
 * O cadastro pela internet, de ponta a ponta, no Supabase de verdade.
 *
 * Faz o que um amigo do Ed faria: escolhe o plano, cria a conta, entra e cai
 * nas configurações — e confere o que o sistema promete na tela de planos:
 * sete dias com TUDO liberado, inclusive o financeiro.
 *
 * Apaga a oficina no fim. Se falhar no meio, a limpeza roda mesmo assim.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { randomUUID } from 'node:crypto'
import { limparOficina, limparContasDeTeste } from './limpar-teste'

config({ path: '.env.test.local', quiet: true })
config({ path: '.env.local', quiet: true })

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!
const ANON = process.env.VITE_SUPABASE_ANON_KEY!
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const MARCA = Date.now()
const SENHA = `Teste!${randomUUID().slice(0, 10)}`
const EMAIL = `publico.${MARCA}@example.com`

let passou = 0
let falhou = 0
const ok = (n: string, d = '') => { passou++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? ` (${d})` : ''}`) }
const erro = (n: string, d: string) => { falhou++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`) }

const anon = createClient(URL, ANON, { auth: { persistSession: false } })

/**
 * O que a função respondeu, mesmo quando ela recusa.
 *
 * Recusa vem como HTTP 400, e aí o supabase-js põe tudo em `error` e deixa
 * `data` nulo — foi assim que este teste leu "null" e achou que a recusa não
 * tinha acontecido. A tela faz exatamente isto: abre o corpo da resposta.
 */
async function chamar(corpo: Record<string, unknown>) {
  const { data, error } = await anon.functions.invoke('cadastro', { body: corpo })
  if (!error) return data as Record<string, unknown>
  const resposta = (error as { context?: Response }).context
  return ((await resposta?.json().catch(() => null)) ?? { erro: error.message }) as Record<string, unknown>
}
let oficinaId = ''

console.log('\n\x1b[1mCadastro pela internet\x1b[0m')
console.log(`  ${URL}`)

try {
  const { data: situacao } = await anon.functions.invoke('cadastro', { body: { acao: 'situacao' } })
  situacao?.aberto === true ? ok('o cadastro está aberto') : erro('cadastro fechado', JSON.stringify(situacao))

  const { data: lista } = await anon.functions.invoke('cadastro', { body: { acao: 'planos' } })
  const planos = (lista?.planos ?? []) as Array<{ id: string; nome: string; preco_mensal: number }>
  planos.length >= 2
    ? ok('quem não está logado vê os planos', planos.map((p) => p.nome).join(', '))
    : erro('planos', JSON.stringify(lista))

  // Escolhe o Gestão Total, como faria quem quer ver o financeiro.
  const escolhido = planos.find((p) => p.id === 'completo') ?? planos[0]

  const { data: criado, error: eCriar } = await anon.functions.invoke('cadastro', {
    body: {
      acao: 'criar',
      oficina: `[publico ${MARCA}] Oficina do Amigo`,
      email: EMAIL,
      senha: SENHA,
      plano: escolhido.id,
      aceitou_os_termos: true,
      termos_versao: '2026-09-01',
    },
  })
  if (eCriar) throw new Error(`criar: ${eCriar.message}`)
  oficinaId = criado?.oficina_id ?? ''
  oficinaId ? ok('a conta é criada com quatro campos', `plano escolhido: ${escolhido.nome}`) : erro('criar conta', JSON.stringify(criado))
  criado?.precisa_confirmar_email === false
    ? ok('e já entra sem confirmar o e-mail, como foi decidido')
    : erro('confirmação de e-mail', JSON.stringify(criado))

  // Entra como a pessoa entraria.
  const app = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error: eLogin } = await app.auth.signInWithPassword({ email: EMAIL, password: SENHA })
  eLogin ? erro('entrar logo após criar', eLogin.message) : ok('e consegue entrar na hora')

  const { data: oficina } = await app.from('oficinas').select('*').eq('id', oficinaId).single()
  oficina?.plano === 'gratuito' && oficina?.plano_escolhido === escolhido.id
    ? ok('entra no plano de teste, com o plano escolhido guardado')
    : erro('planos da oficina', JSON.stringify({ plano: oficina?.plano, escolhido: oficina?.plano_escolhido }))
  oficina?.teste_ate
    ? ok('com prazo de teste marcado', `até ${oficina.teste_ate}`)
    : erro('sem prazo de teste', JSON.stringify(oficina))

  const { data: temFinanceiro } = await app.rpc('minha_oficina_tem_financeiro')
  temFinanceiro === true
    ? ok('e com o financeiro liberado durante o teste, como a tela promete')
    : erro('financeiro no teste', String(temFinanceiro))

  const { data: usuario } = await app.from('usuarios').select('nome, perfil').eq('email', EMAIL).single()
  usuario?.perfil === 'admin'
    ? ok('a pessoa entra como administradora da própria oficina', `nome sugerido: ${usuario.nome}`)
    : erro('perfil', JSON.stringify(usuario))

  // O mesmo e-mail não cria duas oficinas.
  const repetido = await chamar({
    acao: 'criar', oficina: 'Outra', email: EMAIL, senha: SENHA,
    plano: escolhido.id, aceitou_os_termos: true, termos_versao: '2026-09-01',
  })
  repetido?.erro
    ? ok('o mesmo e-mail não cria uma segunda oficina', String(repetido.erro))
    : erro('e-mail repetido', JSON.stringify(repetido))

  // Sem aceitar os termos, não passa.
  const semAceite = await chamar({
    acao: 'criar', oficina: 'Sem aceite', email: `outro.${MARCA}@example.com`,
    senha: SENHA, plano: 'completo',
  })
  semAceite?.erro
    ? ok('e sem aceitar os termos também não', String(semAceite.erro))
    : erro('aceite dos termos', JSON.stringify(semAceite))
  const senhaCurta = await chamar({
    acao: 'criar', oficina: 'Senha curta', email: `curta.${MARCA}@example.com`,
    senha: '1234', plano: 'completo', aceitou_os_termos: true, termos_versao: '2026-09-01',
  })
  senhaCurta?.erro
    ? ok('e senha curta é recusada', String(senhaCurta.erro))
    : erro('senha curta aceita', JSON.stringify(senhaCurta))
} catch (e) {
  erro('execução interrompida', (e as Error).message)
} finally {
  console.log('\n\x1b[1mLimpeza\x1b[0m')
  const { data: doTeste } = await admin.from('oficinas').select('id').like('nome', '[publico%')
  const problemas: string[] = []
  for (const o of doTeste ?? []) problemas.push(...(await limparOficina(admin, o.id)))
  problemas.push(...(await limparContasDeTeste(admin, ['publico.', 'outro.', 'curta.'])))
  const { data: sobrou } = await admin.from('oficinas').select('nome').like('nome', '[publico%')
  problemas.length === 0 && (sobrou?.length ?? 0) === 0
    ? ok('oficina de teste removida')
    : erro('sobrou coisa no banco', problemas.join(' | ') || JSON.stringify(sobrou))
}

console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
process.exit(falhou === 0 ? 0 : 1)
