/**
 * Reserva de estoque: a peça prometida para uma ordem em aberto.
 *
 * A reserva não grava nada — é lida dos itens das ordens que ainda não
 * terminaram (src/funcionalidades/estoque/reservas.ts). O que este teste prova,
 * contra o banco de verdade e com as permissões de verdade:
 *
 * - dono e balcão leem a reserva, e os dois veem o mesmo número;
 * - ordem finalizada sai da reserva (a peça já saiu do estoque);
 * - ordem cancelada sai da reserva sem mexer no extrato;
 * - mudar a quantidade de um item muda a reserva na hora;
 * - o estoque físico só muda na finalização, como antes.
 *
 * A consulta é a mesma de `listarReservas`. Ela está repetida aqui porque o
 * módulo do app lê as chaves por `import.meta.env`, que não existe fora do
 * Vite — se mudar lá, mude aqui.
 *
 * Roda numa oficina descartável e apaga tudo no fim.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
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
const MARCA = Date.now()
const SENHA = `Teste!${randomUUID().slice(0, 10)}`

let passou = 0
let falhou = 0
const falhas: string[] = []
const ok = (n: string, d = '') => { passou++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? ` (${d})` : ''}`) }
const erro = (n: string, d: string) => { falhou++; falhas.push(`${n} — ${d}`); console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`) }
const confere = (n: string, veio: unknown, esperado: unknown) =>
  veio === esperado ? ok(n, String(veio)) : erro(n, `esperava ${esperado} e veio ${veio}`)

/** A mesma consulta de listarReservas, somada por produto. */
async function reservaDe(cliente: SupabaseClient, produtoId: string) {
  const { data, error } = await cliente
    .from('os_itens')
    .select('produto_id, quantidade, ordem:ordens_servico!inner(id, numero, status)')
    .eq('tipo', 'produto')
    .not('produto_id', 'is', null)
    .in('ordem.status', ['aberta', 'em_andamento', 'pausada', 'aguardando_conferencia'])
  if (error) throw new Error(`reserva: ${error.message}`)
  const doProduto = (data ?? []).filter((i) => i.produto_id === produtoId)
  return {
    total: doProduto.reduce((s, i) => s + Number(i.quantidade), 0),
    ordens: new Set(doProduto.map((i) => (i.ordem as unknown as { id: string }).id)).size,
  }
}

async function limparTudo() {
  console.log('\n\x1b[1mLimpeza\x1b[0m')
  const { data: antigas } = await admin.from('oficinas').select('id').like('nome', '[reserva%')
  const problemas: string[] = []
  for (const o of antigas ?? []) problemas.push(...(await limparOficina(admin, o.id)))
  problemas.push(...(await limparContasDeTeste(admin, ['reserva.'])))
  const { data: sobrou } = await admin.from('oficinas').select('nome').like('nome', '[reserva%')
  if (problemas.length || (sobrou?.length ?? 0) > 0) {
    erro('a oficina de teste NÃO saiu do banco', problemas.join(' | ') || 'ainda existe')
  } else ok('oficina de teste removida')
}

async function main() {
  console.log('\n\x1b[1mReserva de estoque\x1b[0m')
  console.log(`  ${URL}`)

  const { data: of, error: eOf } = await admin
    .from('oficinas')
    .insert({ nome: `[reserva ${MARCA}] Oficina`, plano: 'completo' })
    .select().single()
  if (eOf || !of) throw new Error(`oficina: ${eOf?.message ?? 'sem retorno'}`)

  async function criar(nome: string, perfil: string) {
    const email = `reserva.${perfil}.${MARCA}@example.com`
    const { data: u, error } = await admin.auth.admin.createUser({
      email, password: SENHA, email_confirm: true,
    })
    if (error) throw new Error(`usuário ${perfil}: ${error.message}`)
    await admin.from('usuarios').insert({
      id: u.user!.id, oficina_id: of!.id, nome, email, perfil, ativo: true,
    })
    const cliente = createClient(URL!, ANON!, { auth: { persistSession: false } })
    await cliente.auth.signInWithPassword({ email, password: SENHA })
    return { cliente, id: u.user!.id }
  }
  const dono = await criar('Dono', 'admin')
  const balcao = await criar('Balcão', 'vendedor')
  ok('oficina com dono e balcão')

  // Uma peça com 5 litros na prateleira.
  const { data: oleo, error: eProd } = await dono.cliente
    .from('produtos')
    .insert({ nome: 'Óleo 20W50', unidade: 'L', preco_custo: 20, preco_venda: 40, estoque_minimo: 0 })
    .select().single()
  if (eProd || !oleo) throw new Error(`produto: ${eProd?.message ?? 'sem retorno'}`)
  const { error: eEnt } = await dono.cliente.rpc('registrar_movimentacao', {
    p_produto_id: oleo.id, p_tipo: 'entrada', p_quantidade: 5, p_motivo: 'Compra inicial',
  })
  if (eEnt) throw new Error(`entrada: ${eEnt.message}`)

  const { data: cli } = await balcao.cliente
    .from('clientes').insert({ nome: 'Cliente da Reserva' }).select().single()
  const { data: moto } = await balcao.cliente.rpc('criar_moto_com_proprietario', {
    p_cliente_id: cli!.id, p_placa: `RSV${String(MARCA).slice(-4)}`,
    p_marca: 'Honda', p_modelo: 'CG 160', p_ano: 2021, p_cor: 'Preta',
    p_chassi: null, p_km_atual: 10000,
  })
  const motoId = (moto as { id: string }).id

  /** Orçamento com o óleo, aprovado pelo balcão. Devolve a OS. */
  async function ordemCom(litros: number): Promise<string> {
    const { data: orc, error: eOrc } = await balcao.cliente.rpc('salvar_orcamento_com_itens', {
      p_orcamento_id: null, p_cliente_id: cli!.id, p_moto_id: motoId,
      p_km_registrado: 10000, p_validade_dias: 7, p_garantia_dias: 90,
      p_observacoes: null, p_desconto: 0, p_desconto_percentual: null,
      p_itens: [{ tipo: 'produto', produto_id: oleo!.id, servico_id: null,
                  descricao: 'Óleo 20W50', quantidade: litros, valor_unitario: 40 }],
      p_indicador_id: null,
    })
    if (eOrc) throw new Error(`orçamento: ${eOrc.message}`)
    const { data: os, error: eAp } = await balcao.cliente.rpc('aprovar_orcamento', {
      p_orcamento_id: orc as string, p_responsavel_id: dono.id,
    })
    if (eAp) throw new Error(`aprovar: ${eAp.message}`)
    return os as string
  }

  const estoque = async () =>
    Number((await admin.from('produtos').select('estoque_atual').eq('id', oleo!.id).single()).data!.estoque_atual)

  const osA = await ordemCom(2)
  const osB = await ordemCom(1)
  const osC = await ordemCom(1)
  ok('três ordens aprovadas pelo balcão', '2 L + 1 L + 1 L')
  confere('aprovar não mexe no estoque físico', await estoque(), 5)

  let r = await reservaDe(dono.cliente, oleo.id)
  confere('dono vê 4 L reservados', r.total, 4)
  confere('em 3 ordens', r.ordens, 3)
  confere('balcão vê os mesmos 4 L', (await reservaDe(balcao.cliente, oleo.id)).total, 4)

  // Finalizar a C: a peça sai do estoque e da reserva ao mesmo tempo.
  const { error: eAnd } = await dono.cliente.rpc('mudar_status_da_os', {
    p_ordem_servico_id: osC, p_status: 'em_andamento',
  })
  if (eAnd) throw new Error(`em andamento: ${eAnd.message}`)
  const { error: eFin } = await dono.cliente.rpc('finalizar_os', {
    p_ordem_servico_id: osC, p_permitir_negativo: false,
  })
  if (eFin) throw new Error(`finalizar: ${eFin.message}`)
  confere('finalizar baixa o estoque físico', await estoque(), 4)
  confere('e tira a ordem da reserva', (await reservaDe(dono.cliente, oleo.id)).total, 3)

  // Cancelar a B: sai da reserva, e o estoque físico nem se mexe.
  const { error: eCanc } = await dono.cliente.rpc('cancelar_os', {
    p_ordem_servico_id: osB, p_motivo: 'Cliente desistiu',
  })
  if (eCanc) throw new Error(`cancelar: ${eCanc.message}`)
  confere('cancelar tira a ordem da reserva', (await reservaDe(dono.cliente, oleo.id)).total, 2)
  confere('cancelar ordem aberta não mexe no estoque físico', await estoque(), 4)

  // Trocar a quantidade no meio do serviço: a reserva acompanha.
  const { error: eEd } = await balcao.cliente
    .from('os_itens').update({ quantidade: 3, valor_total: 120 })
    .eq('ordem_servico_id', osA).eq('produto_id', oleo.id)
  if (eEd) erro('balcão muda a quantidade do item', eEd.message)
  else confere('reserva acompanha a quantidade nova', (await reservaDe(dono.cliente, oleo.id)).total, 3)

  // A conta do aviso de aprovação: 4 na prateleira, 3 prometidos, 1 livre.
  const { data: vw, error: eVw } = await balcao.cliente
    .from('vw_produtos').select('id, estoque_atual').in('id', [oleo.id])
  if (eVw) erro('balcão lê o estoque pela vw_produtos', eVw.message)
  else {
    const livre = Number(vw![0].estoque_atual) - (await reservaDe(balcao.cliente, oleo.id)).total
    confere('balcão vê 1 L livre para um orçamento novo', livre, 1)
  }

  // Nada no extrato além da entrada e da baixa da finalização.
  const { count } = await admin
    .from('movimentacoes_estoque').select('*', { count: 'exact', head: true }).eq('produto_id', oleo.id)
  confere('o extrato tem só a compra e a baixa da OS finalizada', count, 2)
}

try {
  await main()
} catch (e) {
  erro('o teste parou no meio', e instanceof Error ? e.message : String(e))
} finally {
  await limparTudo()
}

console.log(`\n\x1b[1m${passou} passaram, ${falhou} falharam\x1b[0m`)
if (falhas.length) {
  console.log('\nFalhas:')
  for (const f of falhas) console.log(`  - ${f}`)
}
console.log('')
process.exit(falhou > 0 ? 1 : 0)
