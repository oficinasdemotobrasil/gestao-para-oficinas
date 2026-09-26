/**
 * Zera o movimento de uma oficina sem apagar a oficina.
 *
 * Serve para a hora em que uma oficina que estava só experimentando decide
 * usar o sistema de verdade: o cadastro dela, o logo, a cor e a chave Pix
 * continuam; clientes, motos, orçamentos, ordens, dinheiro e estoque saem.
 *
 * Diferente do `limpar-teste`, que apaga a oficina inteira e só é usado pelos
 * testes automáticos, aqui a oficina FICA. Por isso o script é separado: são
 * duas intenções diferentes, e misturar as duas num arquivo só é o tipo de
 * economia que um dia apaga o cliente errado.
 *
 * Sem CONFIRMAR=1 ele não apaga nada: conta o que existe, grava o backup e
 * mostra o que faria. O backup vai para `backups/` (fora do git) e é a única
 * volta possível — restaurar dele é trabalho manual.
 *
 *   npx tsx scripts/zerar-oficina.ts "Oficina Tiago Carvalho"
 *   CONFIRMAR=1 npx tsx scripts/zerar-oficina.ts "Oficina Tiago Carvalho"
 *
 * Com APAGAR_ACESSOS, os acessos listados (por e-mail) saem da oficina e do
 * Auth. Quem não estiver na lista fica. A oficina precisa terminar com pelo
 * menos um admin ativo, e o script recusa se isso não for verdade.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
config({ path: path.join(raiz, '.env.test.local'), quiet: true })
config({ path: path.join(raiz, '.env.local'), quiet: true })

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const CONFIRMAR = process.env.CONFIRMAR === '1'
const APAGAR_ACESSOS = (process.env.APAGAR_ACESSOS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

const procurado = process.argv[2]

if (!URL || !SERVICE_ROLE) {
  console.error('\nFaltam as chaves. Veja .env.local.example.\n')
  process.exit(1)
}
if (!procurado) {
  console.error('\nDiga qual oficina: npx tsx scripts/zerar-oficina.ts "Oficina Tal"\n')
  process.exit(1)
}

const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } })

/*
 * A ordem do apagar, filho antes do pai.
 *
 * `os_itens`, `os_status_historico` e `apontamentos_tempo` não entram: caem por
 * cascata com a ordem de serviço. Apagados direto, esbarram no gatilho que
 * proíbe mexer nos itens de uma ordem já fechada — regra certa, lugar errado.
 *
 * As contas vêm ANTES das ordens: a conta a receber aponta para a OS com
 * 'restrict', então a ordem primeiro seria recusada.
 */
const ORDEM = [
  'comissoes',
  'contas_receber',
  'contas_pagar',
  'ordens_servico',
  'orcamento_itens',
  'orcamentos',
  'notas_fiscais_entrada',
  'itens_nf_saida',
  'notas_fiscais_saida',
  'moto_proprietarios',
  'motos',
  'clientes',
  'produtos',
  'servicos',
  'indicadores',
] as const

/** Tudo que o backup precisa guardar, inclusive o que sai por cascata. */
const PARA_O_BACKUP = [
  'usuarios',
  'clientes',
  'motos',
  'moto_proprietarios',
  'orcamentos',
  'orcamento_itens',
  'ordens_servico',
  'os_itens',
  'os_status_historico',
  'apontamentos_tempo',
  'contas_receber',
  'contas_pagar',
  'movimentacoes_estoque',
  'produtos',
  'servicos',
  'notas_fiscais_entrada',
  'notas_fiscais_saida',
  'itens_nf_saida',
  'indicadores',
  'comissoes',
  'assinaturas',
  'eventos_asaas',
] as const

const { data: oficinas, error: erroBusca } = await admin
  .from('oficinas')
  .select('*')
  .ilike('nome', `%${procurado}%`)

if (erroBusca) {
  console.error('\nNão consegui ler as oficinas:', erroBusca.message, '\n')
  process.exit(1)
}
if (!oficinas || oficinas.length === 0) {
  console.error(`\nNenhuma oficina com "${procurado}" no nome.\n`)
  process.exit(1)
}
if (oficinas.length > 1) {
  console.error('\nMais de uma oficina bate com esse nome. Seja mais específico:')
  for (const o of oficinas) console.error(`  - ${o.nome}`)
  console.error('')
  process.exit(1)
}

const oficina = oficinas[0]
console.log(`\nOficina: ${oficina.nome}`)
console.log(`Id:      ${oficina.id}`)
console.log(`Plano:   ${oficina.plano} (${oficina.status})`)

// 1. O backup, sempre — mesmo no ensaio.
const conteudo: Record<string, unknown[]> = { oficinas: [oficina] }
for (const tabela of PARA_O_BACKUP) {
  const { data, error } = await admin.from(tabela).select('*').eq('oficina_id', oficina.id)
  if (error) {
    console.error(`\nNão consegui ler ${tabela}: ${error.message}`)
    console.error('Parei aqui: backup incompleto não serve de backup.\n')
    process.exit(1)
  }
  conteudo[tabela] = data ?? []
}

const dia = new Date().toISOString().slice(0, 10)
const apelido = oficina.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const destino = path.join(raiz, 'backups', `${apelido}-${dia}.json`)
await mkdir(path.dirname(destino), { recursive: true })
await writeFile(destino, JSON.stringify(conteudo, null, 2), 'utf8')

console.log('\n--- o que existe hoje ---')
for (const tabela of PARA_O_BACKUP) {
  const quantas = conteudo[tabela].length
  if (quantas > 0) console.log(`${tabela.padEnd(24)} ${quantas}`)
}
console.log(`\nBackup gravado em ${destino}`)

// 2. Os acessos que saem, conferidos antes de qualquer apagar.
const usuarios = conteudo.usuarios as Array<{
  id: string
  nome: string
  email: string
  perfil: string
  ativo: boolean
}>

const saem = usuarios.filter((u) => APAGAR_ACESSOS.includes(u.email.toLowerCase()))
const ficam = usuarios.filter((u) => !APAGAR_ACESSOS.includes(u.email.toLowerCase()))
const naoEncontrados = APAGAR_ACESSOS.filter(
  (e) => !usuarios.some((u) => u.email.toLowerCase() === e),
)

if (naoEncontrados.length > 0) {
  console.error(`\nEstes e-mails não estão nesta oficina: ${naoEncontrados.join(', ')}`)
  console.error('Confira a lista antes de continuar.\n')
  process.exit(1)
}
if (saem.length > 0 && !ficam.some((u) => u.perfil === 'admin' && u.ativo)) {
  console.error('\nIsso deixaria a oficina sem nenhum admin ativo. Recusei.\n')
  process.exit(1)
}

console.log('\n--- acessos ---')
for (const u of ficam) console.log(`  fica   ${u.email} (${u.perfil})`)
for (const u of saem) console.log(`  SAI    ${u.email} (${u.perfil})`)

if (!CONFIRMAR) {
  console.log('\nEnsaio: nada foi apagado. Rode de novo com CONFIRMAR=1 para valer.\n')
  process.exit(0)
}

// 3. O estoque, do mais novo para o mais antigo, em passadas.
//
// Uma passada só não basta: o extrato tem pares saída/devolução em que apagar
// a devolução primeiro derrubaria o saldo abaixo de zero, e a trava recusa —
// com razão. Apagando o que dá em cada passada, a ordem se resolve sozinha.
const problemas: string[] = []
let restantes = (conteudo.movimentacoes_estoque as Array<{ id: string; criado_em: string }>)
  .slice()
  .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
  .map((m) => m.id)

console.log(`\nApagando ${restantes.length} movimentações de estoque…`)

while (restantes.length > 0) {
  const teimosas: string[] = []
  const erros = new Map<string, string>()

  for (const id of restantes) {
    const { error } = await admin.from('movimentacoes_estoque').delete().eq('id', id)
    if (error) {
      teimosas.push(id)
      erros.set(id, error.message)
    }
  }

  if (teimosas.length === restantes.length) {
    for (const id of teimosas) problemas.push(`movimentação ${id}: ${erros.get(id)}`)
    break
  }
  restantes = teimosas
}

// 4. O resto.
for (const tabela of ORDEM) {
  const { error } = await admin.from(tabela).delete().eq('oficina_id', oficina.id)
  if (error) problemas.push(`${tabela}: ${error.message}`)
  else console.log(`apagado: ${tabela}`)
}

// 5. Os acessos, na oficina e no Auth.
for (const u of saem) {
  const { error } = await admin.from('usuarios').delete().eq('id', u.id)
  if (error) {
    problemas.push(`usuario ${u.email}: ${error.message}`)
    continue
  }
  const { error: erroAuth } = await admin.auth.admin.deleteUser(u.id)
  if (erroAuth) problemas.push(`auth ${u.email}: ${erroAuth.message}`)
  else console.log(`apagado: acesso ${u.email}`)
}

/*
 * 6. A conferência, dizendo o que é para estar zerado e o que é para ficar.
 *
 * Sem essa distinção, a lista mostrava número diferente de zero em `usuarios`,
 * `assinaturas` e `eventos_asaas` debaixo de um título que sugeria erro — e
 * quem está rodando um script destrutivo, lendo isso, pode "terminar o
 * serviço" à mão e apagar o acesso do dono ou o histórico de cobrança.
 */
const MANTIDAS = new Set(['usuarios', 'assinaturas', 'eventos_asaas'])

console.log('\n--- conferência ---')
let sobrouAlgo = false
for (const tabela of PARA_O_BACKUP) {
  const { count } = await admin
    .from(tabela)
    .select('*', { count: 'exact', head: true })
    .eq('oficina_id', oficina.id)

  if (MANTIDAS.has(tabela)) {
    console.log(`${tabela.padEnd(24)} ${count}  (mantido de propósito)`)
    continue
  }
  if ((count ?? 0) > 0) sobrouAlgo = true
  console.log(`${tabela.padEnd(24)} ${count}${(count ?? 0) > 0 ? '  ← deveria ser zero' : ''}`)
}

if (sobrouAlgo) {
  console.error('\nAlguma tabela que deveria ter sido zerada ainda tem linhas.')
  console.error('NÃO apague à mão: veja o erro acima, ou rode de novo.')
}

if (problemas.length > 0) {
  console.error('\nSobrou coisa para resolver à mão:')
  for (const p of problemas) console.error(`  - ${p}`)
  console.error('')
  process.exit(1)
}

console.log('\nOficina zerada. O cadastro, o logo, a cor e o plano continuam como estavam.\n')
