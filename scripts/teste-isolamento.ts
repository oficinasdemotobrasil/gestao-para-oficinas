/**
 * Teste de isolamento entre oficinas — pela rede, contra o Supabase de verdade.
 *
 * Cria duas oficinas fictícias com dados, entra como usuário da oficina A e
 * prova que ele não consegue ler, editar nem apagar nada da oficina B. No fim,
 * apaga tudo o que criou.
 *
 * Este é o teste oficial do critério de aceite. Ele passa pelo mesmo caminho do
 * aplicativo: PostgREST, publishable key e JWT do usuário. O
 * scripts/validar-banco.ts exercita a mesma regra uma camada abaixo, direto nas
 * políticas, e roda sem precisar de projeto.
 *
 * Antes de rodar, crie o arquivo .env.test.local (já ignorado pelo git) com:
 *
 *   SUPABASE_URL=https://SEU-PROJETO.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=a-service-role-key-do-painel
 *
 * A service_role serve só para montar e desmontar o cenário. Nenhuma consulta
 * do teste em si usa ela — se usasse, o teste passaria por engano, porque essa
 * chave ignora o RLS.
 *
 *   npm run teste:isolamento
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { limparOficina } from './limpar-teste'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
config({ path: path.join(raiz, '.env.test.local'), quiet: true })
config({ path: path.join(raiz, '.env.local'), quiet: true })

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.VITE_SUPABASE_ANON_KEY

if (!URL || !SERVICE_ROLE || !ANON) {
  console.error(
    '\nFaltam chaves. Crie .env.test.local com SUPABASE_URL e ' +
      'SUPABASE_SERVICE_ROLE_KEY, e confira VITE_SUPABASE_ANON_KEY em .env.local.\n',
  )
  process.exit(1)
}

const admin = createClient(URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const marca = Date.now()
const SENHA = `Teste!${randomUUID().slice(0, 12)}`

let passou = 0
let falhou = 0
const falhas: string[] = []

function ok(nome: string, detalhe?: string) {
  passou++
  console.log(`  \x1b[32m✓\x1b[0m ${nome}${detalhe ? ` (${detalhe})` : ''}`)
}

function erro(nome: string, detalhe: string) {
  falhou++
  falhas.push(`${nome} — ${detalhe}`)
  console.log(`  \x1b[31m✗\x1b[0m ${nome}\n      ${detalhe}`)
}

interface Cenario {
  ordemServicoId: string
  oficinaId: string
  adminId: string
  vendedorId: string
  mecanicoId: string
  clienteId: string
  motoId: string
  produtoId: string
  servicoId: string
  emails: string[]
}

async function criarUsuario(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: SENHA,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`Não criou ${email}: ${error?.message}`)
  return data.user.id
}

async function montarOficina(rotulo: string, placa: string): Promise<Cenario> {
  const { data: oficina, error: erroOficina } = await admin
    .from('oficinas')
    .insert({ nome: `[teste ${marca}] Oficina ${rotulo}` })
    .select()
    .single()
  if (erroOficina) throw erroOficina

  const emails = ['admin', 'vendedor', 'mecanico'].map(
    (p) => `teste.isolamento.${marca}.${rotulo.toLowerCase()}.${p}@example.com`,
  )
  const [adminId, vendedorId, mecanicoId] = await Promise.all(emails.map(criarUsuario))

  const { error: erroUsuarios } = await admin.from('usuarios').insert([
    { id: adminId, oficina_id: oficina.id, nome: `Admin ${rotulo}`, email: emails[0], perfil: 'admin' },
    { id: vendedorId, oficina_id: oficina.id, nome: `Vendedor ${rotulo}`, email: emails[1], perfil: 'vendedor' },
    { id: mecanicoId, oficina_id: oficina.id, nome: `Mecânico ${rotulo}`, email: emails[2], perfil: 'mecanico' },
  ])
  if (erroUsuarios) throw erroUsuarios

  const { data: cliente, error: erroCliente } = await admin
    .from('clientes')
    .insert({ oficina_id: oficina.id, nome: `Cliente da ${rotulo}`, telefone: '11988887777' })
    .select()
    .single()
  if (erroCliente) throw erroCliente

  const { data: moto, error: erroMoto } = await admin
    .from('motos')
    .insert({ oficina_id: oficina.id, placa, marca: 'Honda', modelo: 'CG 160', km_atual: 1000 })
    .select()
    .single()
  if (erroMoto) throw erroMoto

  const { error: erroDono } = await admin
    .from('moto_proprietarios')
    .insert({ oficina_id: oficina.id, moto_id: moto.id, cliente_id: cliente.id })
  if (erroDono) throw erroDono

  const { data: produto, error: erroProduto } = await admin
    .from('produtos')
    .insert({
      oficina_id: oficina.id,
      nome: `Peça da ${rotulo}`,
      preco_custo: 30,
      preco_venda: 90,
      estoque_atual: 5,
    })
    .select()
    .single()
  if (erroProduto) throw erroProduto

  const { data: servico, error: erroServico } = await admin
    .from('servicos')
    .insert({ oficina_id: oficina.id, nome: `Serviço da ${rotulo}`, preco: 150 })
    .select()
    .single()
  if (erroServico) throw erroServico

  await admin.from('contas_receber').insert({
    oficina_id: oficina.id,
    cliente_id: cliente.id,
    descricao: `Recebimento da ${rotulo}`,
    valor: 240,
    vencimento: new Date().toISOString().slice(0, 10),
  })

  await admin.from('contas_pagar').insert({
    oficina_id: oficina.id,
    descricao: `Despesa da ${rotulo}`,
    categoria: 'Aluguel',
    valor: 500,
    vencimento: new Date().toISOString().slice(0, 10),
  })

  // Uma ordem de serviço de verdade, atribuída ao mecânico: sem ela, metade do
  // que a Fase 3 criou não teria linha nenhuma para o teste tentar alcançar.
  const { data: os, error: erroOs } = await admin
    .from('ordens_servico')
    .insert({
      oficina_id: oficina.id,
      cliente_id: cliente.id,
      moto_id: moto.id,
      responsavel_id: mecanicoId,
      status: 'aberta',
      km_entrada: 1000,
      valor_total: 150,
    })
    .select()
    .single()
  if (erroOs) throw erroOs

  const { error: erroItem } = await admin.from('os_itens').insert({
    oficina_id: oficina.id,
    ordem_servico_id: os.id,
    tipo: 'servico',
    servico_id: servico.id,
    descricao: `Serviço da ${rotulo}`,
    quantidade: 1,
    valor_unitario: 150,
    valor_total: 150,
  })
  if (erroItem) throw erroItem

  return {
    ordemServicoId: os.id,
    oficinaId: oficina.id,
    adminId,
    vendedorId,
    mecanicoId,
    clienteId: cliente.id,
    motoId: moto.id,
    produtoId: produto.id,
    servicoId: servico.id,
    emails,
  }
}

/** Cliente igual ao do aplicativo: publishable key + sessão do usuário. */
async function entrarComo(email: string): Promise<SupabaseClient> {
  const cliente = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await cliente.auth.signInWithPassword({ email, password: SENHA })
  if (error) throw new Error(`Login falhou para ${email}: ${error.message}`)
  return cliente
}

async function esperaLinhas(
  nome: string,
  consulta: PromiseLike<{ data: unknown[] | null; error: unknown }>,
  esperado: number,
) {
  const { data, error } = await consulta
  if (error) {
    // Erro de permissão também significa "não alcança" — o que se quer provar.
    if (esperado === 0) return ok(nome, 'recusado pelo banco')
    return erro(nome, `consulta falhou: ${(error as Error).message}`)
  }
  const n = data?.length ?? 0
  if (n === esperado) ok(nome)
  else erro(nome, `esperava ${esperado} linha(s), veio ${n}`)
}

async function esperaBloqueio(
  nome: string,
  consulta: PromiseLike<{ data: unknown[] | null; error: unknown }>,
) {
  const { data, error } = await consulta
  if (error) return ok(nome, 'recusado pelo banco')
  const n = data?.length ?? 0
  if (n === 0) ok(nome, 'nenhuma linha atingida')
  else erro(nome, `a operação passou e atingiu ${n} linha(s)`)
}

async function testar(a: Cenario, b: Cenario) {
  console.log('\n\x1b[1mOficina A tentando alcançar a Oficina B\x1b[0m')
  const adminA = await entrarComo(a.emails[0])

  await esperaLinhas('só enxerga a própria oficina', adminA.from('oficinas').select('id'), 1)
  await esperaLinhas('só enxerga o próprio cliente', adminA.from('clientes').select('id'), 1)
  await esperaLinhas('só enxerga a própria moto', adminA.from('motos').select('id'), 1)
  await esperaLinhas('só enxerga o próprio produto', adminA.from('produtos').select('id'), 1)
  await esperaLinhas('só enxerga o próprio serviço', adminA.from('servicos').select('id'), 1)
  await esperaLinhas('só enxerga a própria equipe', adminA.from('usuarios').select('id'), 3)

  await esperaLinhas(
    'não lê o cliente da B nem pelo id exato',
    adminA.from('clientes').select('id').eq('id', b.clienteId),
    0,
  )
  await esperaLinhas(
    'não acha a moto da B pela placa',
    adminA.from('motos').select('id').eq('id', b.motoId),
    0,
  )
  await esperaLinhas(
    'não lê o produto da B pela view do catálogo',
    adminA.from('vw_produtos').select('id').eq('id', b.produtoId),
    0,
  )
  await esperaLinhas(
    'não lê o financeiro da B',
    adminA.from('contas_receber').select('id').eq('oficina_id', b.oficinaId),
    0,
  )
  await esperaLinhas(
    'não lê a equipe da B',
    adminA.from('usuarios').select('id').eq('oficina_id', b.oficinaId),
    0,
  )

  // As tabelas que a Fase 3 encheu -------------------------------------------
  await esperaLinhas(
    'não lê a ordem de serviço da B',
    adminA.from('ordens_servico').select('id').eq('oficina_id', b.oficinaId),
    0,
  )
  await esperaLinhas(
    'não lê os itens da ordem da B',
    adminA.from('os_itens').select('id').eq('oficina_id', b.oficinaId),
    0,
  )
  await esperaLinhas(
    'não lê o histórico de status da B',
    adminA.from('os_status_historico').select('id').eq('oficina_id', b.oficinaId),
    0,
  )
  await esperaLinhas(
    'não lê o apontamento de tempo da B',
    adminA.from('apontamentos_tempo').select('id').eq('oficina_id', b.oficinaId),
    0,
  )
  await esperaLinhas(
    'não lê as contas a pagar da B',
    adminA.from('contas_pagar').select('id').eq('oficina_id', b.oficinaId),
    0,
  )

  // E as funções, que rodam como donas do banco — o lugar onde um esquecimento
  // atravessaria o RLS sem fazer barulho.
  await esperaBloqueio(
    'não finaliza a ordem da B',
    adminA.rpc('finalizar_os', { p_ordem_servico_id: b.ordemServicoId, p_permitir_negativo: false }),
  )
  await esperaBloqueio(
    'não cancela a ordem da B',
    adminA.rpc('cancelar_os', { p_ordem_servico_id: b.ordemServicoId, p_motivo: null }),
  )
  await esperaBloqueio(
    'não mexe no status da ordem da B',
    adminA.rpc('mudar_status_da_os', { p_ordem_servico_id: b.ordemServicoId, p_status: 'em_andamento' }),
  )
  await esperaBloqueio(
    'não lança cobrança sobre a ordem da B',
    adminA.rpc('criar_cobranca_da_os', {
      p_ordem_servico_id: b.ordemServicoId, p_parcelas: 1,
      p_primeiro_vencimento: new Date().toISOString().slice(0, 10), p_forma_pagamento: null,
    }),
  )
  await esperaBloqueio(
    'não abre o histórico da placa da B',
    adminA.rpc('historico_da_placa', { p_moto_id: b.motoId }),
  )

  // O painel é por oficina: o da A não pode contar o movimento da B.
  const { data: painel, error: erroPainel } = await adminA.rpc('painel', {
    p_de: new Date(Date.now() - 86400000 * 30).toISOString().slice(0, 10),
    p_ate: new Date().toISOString().slice(0, 10),
  })
  const total = Number(painel?.servicos?.abertas ?? -1)
  total === 1
    ? ok('o painel conta só o movimento da própria oficina (1 ordem aberta)')
    : erro('painel', `contou ${total}${erroPainel ? ` — ${erroPainel.message}` : ''}`)

  await esperaBloqueio(
    'não altera o cliente da B',
    adminA.from('clientes').update({ nome: 'invadido' }).eq('id', b.clienteId).select(),
  )
  await esperaBloqueio(
    'não altera o preço do produto da B',
    adminA.from('produtos').update({ preco_venda: 0.01 }).eq('id', b.produtoId).select(),
  )
  await esperaBloqueio(
    'não apaga o cliente da B',
    adminA.from('clientes').delete().eq('id', b.clienteId).select(),
  )
  await esperaBloqueio(
    'não apaga a moto da B',
    adminA.from('motos').delete().eq('id', b.motoId).select(),
  )
  await esperaBloqueio(
    'não renomeia a oficina B',
    adminA.from('oficinas').update({ nome: 'invadida' }).eq('id', b.oficinaId).select(),
  )
  await esperaBloqueio(
    'não grava cliente dentro da oficina B',
    adminA.from('clientes').insert({ oficina_id: b.oficinaId, nome: 'Infiltrado' }).select(),
  )
  await esperaBloqueio(
    'não move a própria moto para a oficina B',
    adminA.from('motos').update({ oficina_id: b.oficinaId }).eq('id', a.motoId).select(),
  )
  await esperaBloqueio(
    'não promove o próprio mecânico a admin da oficina B',
    adminA.from('usuarios').update({ oficina_id: b.oficinaId }).eq('id', a.mecanicoId).select(),
  )

  console.log('\n\x1b[1mE a Oficina B tentando alcançar a Oficina A\x1b[0m')
  const adminB = await entrarComo(b.emails[0])
  await esperaLinhas('só enxerga o próprio cliente', adminB.from('clientes').select('id'), 1)
  await esperaLinhas(
    'não lê o cliente da A',
    adminB.from('clientes').select('id').eq('id', a.clienteId),
    0,
  )
  await esperaLinhas(
    'não lê o financeiro da A',
    adminB.from('contas_receber').select('id').eq('oficina_id', a.oficinaId),
    0,
  )

  console.log('\n\x1b[1mVendedor da Oficina A\x1b[0m')
  const vendedorA = await entrarComo(a.emails[1])
  await esperaLinhas('enxerga os clientes da própria oficina', vendedorA.from('clientes').select('id'), 1)
  await esperaLinhas(
    'NÃO lê a tabela produtos, que carrega o preço de custo',
    vendedorA.from('produtos').select('id'),
    0,
  )
  await esperaLinhas('lê o catálogo pela view, sem custo', vendedorA.from('vw_produtos').select('id'), 1)
  await esperaLinhas('NÃO enxerga financeiro', vendedorA.from('contas_receber').select('id'), 0)
  await esperaBloqueio(
    'NÃO se promove a admin',
    vendedorA.from('usuarios').update({ perfil: 'admin' }).eq('id', a.vendedorId).select(),
  )
  await esperaBloqueio(
    'NÃO edita as configurações da oficina',
    vendedorA.from('oficinas').update({ chave_pix: '11999999999' }).eq('id', a.oficinaId).select(),
  )

  const { data: viaView } = await vendedorA.from('vw_produtos').select('*').limit(1)
  const primeiro = (viaView?.[0] ?? {}) as Record<string, unknown>
  if (!('preco_custo' in primeiro)) ok('a view não devolve preco_custo no JSON')
  else erro('vazamento de custo', 'preco_custo veio na resposta da view')

  console.log('\n\x1b[1mMecânico da Oficina A (com uma ordem no nome dele)\x1b[0m')
  const mecanicoA = await entrarComo(a.emails[2])
  // Ele enxerga o cliente e a moto DA ORDEM DELE, e só. É por derivação: sem
  // isso, abriria a ordem sem saber de que moto se trata.
  await esperaLinhas('enxerga só o cliente da ordem dele', mecanicoA.from('clientes').select('id'), 1)
  await esperaLinhas('enxerga só a moto da ordem dele', mecanicoA.from('motos').select('id'), 1)
  await esperaLinhas(
    'e nenhum cliente da outra oficina',
    mecanicoA.from('clientes').select('id').eq('oficina_id', b.oficinaId),
    0,
  )
  await esperaLinhas('NÃO enxerga produtos', mecanicoA.from('produtos').select('id'), 0)
  await esperaLinhas('NÃO enxerga o catálogo pela view', mecanicoA.from('vw_produtos').select('id'), 0)
  await esperaLinhas('NÃO enxerga financeiro', mecanicoA.from('contas_receber').select('id'), 0)
  await esperaLinhas('enxerga apenas o próprio cadastro', mecanicoA.from('usuarios').select('id'), 1)
  // A tabela tem valor e desconto, então ele não a lê — nem a dele.
  await esperaLinhas('NÃO lê a tabela de ordens', mecanicoA.from('ordens_servico').select('id'), 0)
  await esperaLinhas('NÃO lê a tabela de itens', mecanicoA.from('os_itens').select('id'), 0)
  await esperaLinhas('NÃO lê contas a pagar', mecanicoA.from('contas_pagar').select('id'), 0)

  const { data: minhas } = await mecanicoA.rpc('ordens_do_mecanico')
  Array.isArray(minhas) && minhas.length === 1
    ? ok('recebe pela função dele a ordem que está no nome dele')
    : erro('ordens do mecânico', `veio ${JSON.stringify(minhas)}`)

  const { data: aDele } = await mecanicoA.rpc('os_do_mecanico', { p_ordem_servico_id: a.ordemServicoId })
  aDele && !/valor|preco|custo|desconto|total/i.test(JSON.stringify(aDele))
    ? ok('e ela chega sem um campo de dinheiro sequer')
    : erro('dinheiro na ordem do mecânico', JSON.stringify(aDele).slice(0, 160))

  await esperaBloqueio(
    'não abre a ordem da outra oficina',
    mecanicoA.rpc('os_do_mecanico', { p_ordem_servico_id: b.ordemServicoId }),
  )
  await esperaBloqueio(
    'não abre o painel',
    mecanicoA.rpc('painel', {
      p_de: new Date().toISOString().slice(0, 10),
      p_ate: new Date().toISOString().slice(0, 10),
    }),
  )

  console.log('\n\x1b[1mSem login\x1b[0m')
  const anonimo = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  await esperaLinhas('visitante não lê oficinas', anonimo.from('oficinas').select('id'), 0)
  await esperaLinhas('visitante não lê clientes', anonimo.from('clientes').select('id'), 0)
  await esperaLinhas('visitante não lê motos', anonimo.from('motos').select('id'), 0)

  await Promise.all([
    adminA.auth.signOut(),
    adminB.auth.signOut(),
    vendedorA.auth.signOut(),
    mecanicoA.auth.signOut(),
  ])
}

async function limpar(cenarios: Cenario[]) {
  console.log('\n\x1b[1mLimpeza\x1b[0m')

  // Usa a mesma limpeza dos outros testes, em vez de uma lista de tabelas
  // própria. A lista daqui já tinha ficado para trás uma vez — faltava o
  // extrato de estoque, e o teste dizia "removidos" enquanto deixava oito
  // oficinas no banco do cliente.
  const problemas: string[] = []
  for (const c of cenarios) {
    problemas.push(...(await limparOficina(admin, c.oficinaId)))
    for (const id of [c.adminId, c.vendedorId, c.mecanicoId]) {
      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) problemas.push(`auth ${id}: ${error.message}`)
    }
  }

  // E confere de verdade, em vez de anunciar sucesso por ter chegado ao fim.
  const { data: sobrou } = await admin
    .from('oficinas')
    .select('nome')
    .in('id', cenarios.map((c) => c.oficinaId))

  if (problemas.length > 0 || (sobrou?.length ?? 0) > 0) {
    erro(
      'as oficinas de teste NÃO saíram do banco',
      [...problemas, ...(sobrou ?? []).map((o) => `sobrou: ${o.nome}`)].join(' | '),
    )
  } else {
    ok('oficinas de teste e usuários removidos')
  }
}

async function main() {
  console.log('\n\x1b[1mTeste de isolamento entre oficinas\x1b[0m')
  console.log(`  Projeto: ${URL}`)

  const cenarios: Cenario[] = []
  try {
    console.log('\n\x1b[1mMontando o cenário\x1b[0m')
    const a = await montarOficina('A', 'TST1A23')
    cenarios.push(a)
    const b = await montarOficina('B', 'TST2B34')
    cenarios.push(b)
    ok('duas oficinas com equipe, cliente, moto, produto, serviço e financeiro')

    await testar(a, b)
  } catch (e) {
    erro('execução do teste', (e as Error).message)
  } finally {
    await limpar(cenarios).catch((e) =>
      erro('limpeza', `sobrou dado de teste no banco: ${(e as Error).message}`),
    )
  }

  console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
  if (falhas.length) {
    console.log('\nFalhas:')
    falhas.forEach((f) => console.log(`  - ${f}`))
  }
  process.exit(falhou === 0 ? 0 : 1)
}

void main()
