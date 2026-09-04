/**
 * Sobe todas as migrations em um Postgres real (PGlite, em memória) e prova o
 * isolamento entre oficinas e o recorte de cada perfil.
 *
 * Serve para validar o banco sem Docker e sem projeto Supabase criado. O teste
 * de isolamento oficial, batendo na API do Supabase pela rede, é o
 * scripts/teste-isolamento.ts — este aqui exercita a mesma regra uma camada
 * abaixo, direto nas políticas.
 *
 *   npm run validar:banco
 */
import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const ID = {
  oficinaA: '11111111-1111-4111-8111-111111111111',
  oficinaB: '22222222-2222-4222-8222-222222222222',
  adminA: 'aaaaaaa1-1111-4111-8111-111111111111',
  vendedorA: 'aaaaaaa2-1111-4111-8111-111111111111',
  mecanicoA: 'aaaaaaa3-1111-4111-8111-111111111111',
  adminB: 'bbbbbbb1-2222-4222-8222-222222222222',
  clienteA: 'c1111111-1111-4111-8111-111111111111',
  clienteB: 'c2222222-2222-4222-8222-222222222222',
  motoA: 'd1111111-1111-4111-8111-111111111111',
  motoB: 'd2222222-2222-4222-8222-222222222222',
  produtoA: 'e1111111-1111-4111-8111-111111111111',
  produtoB: 'e2222222-2222-4222-8222-222222222222',
  servicoA: 'f1111111-1111-4111-8111-111111111111',
  servicoB: 'f2222222-2222-4222-8222-222222222222',
}

const db = new PGlite()

/** Preenchido em testarOrcamento, usado no teste de isolamento. */
const ORCAMENTO_DA_A = { id: '' }

let passou = 0
let falhou = 0
const falhas: string[] = []

function ok(nome: string) {
  passou++
  console.log(`  [32m✓[0m ${nome}`)
}

function erro(nome: string, detalhe: string) {
  falhou++
  falhas.push(`${nome} — ${detalhe}`)
  console.log(`  [31m✗[0m ${nome}\n      ${detalhe}`)
}

/** Assume a identidade de um usuário, como o PostgREST faz com o JWT. */
async function logarComo(usuarioId: string) {
  await db.exec('reset role;')
  await db.query('select set_config($1, $2, false)', [
    'request.jwt.claim.sub',
    usuarioId,
  ])
  await db.exec('set role authenticated;')
}

async function comoAdministradorDoBanco() {
  await db.exec('reset role;')
  await db.query('select set_config($1, $2, false)', ['request.jwt.claim.sub', ''])
}

async function contar(sql: string, params: unknown[] = []): Promise<number> {
  const r = await db.query<{ n: number }>(sql, params)
  return Number((r.rows[0] as { n: number | string }).n)
}

/** Espera um número exato de linhas visíveis. */
async function esperaLinhas(nome: string, sql: string, esperado: number, params: unknown[] = []) {
  try {
    const n = await contar(sql, params)
    if (n === esperado) ok(nome)
    else erro(nome, `esperava ${esperado} linha(s), veio ${n}`)
  } catch (e) {
    erro(nome, `consulta falhou: ${(e as Error).message}`)
  }
}

/** Espera que a operação seja recusada: ou erro do banco, ou zero linhas afetadas. */
async function esperaBloqueio(nome: string, sql: string, params: unknown[] = []) {
  try {
    const r = await db.query(sql, params)
    const afetadas = r.affectedRows ?? r.rows.length
    if (afetadas === 0) ok(`${nome} (nenhuma linha atingida)`)
    else erro(nome, `a operação passou e atingiu ${afetadas} linha(s)`)
  } catch (e) {
    const msg = (e as Error).message.split('\n')[0]
    ok(`${nome} (recusado pelo banco: ${msg})`)
  }
}

/** Espera que a operação levante erro. */
async function esperaErro(nome: string, sql: string, params: unknown[] = []) {
  try {
    await db.query(sql, params)
    erro(nome, 'a operação foi aceita, mas deveria ter sido recusada')
  } catch (e) {
    ok(`${nome} (${(e as Error).message.split('\n')[0]})`)
  }
}

async function rodarMigrations() {
  console.log('\n[1mMigrations[0m')

  const shim = await readFile(path.join(raiz, 'scripts/shim-supabase.sql'), 'utf8')
  await db.exec(shim)
  ok('ambiente Supabase simulado (schema auth, papéis, auth.uid())')

  const dir = path.join(raiz, 'supabase/migrations')
  const arquivos = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()

  for (const arquivo of arquivos) {
    const bruto = await readFile(path.join(dir, arquivo), 'utf8')
    // pgcrypto não existe no PGlite e não é necessária: gen_random_uuid() é
    // nativa do Postgres desde a versão 13. Só a validação local ignora a linha.
    const sql = bruto.replace(/create extension[^;]+;/gi, '')
    try {
      await db.exec(sql)
      ok(arquivo)
    } catch (e) {
      erro(arquivo, (e as Error).message)
      throw new Error(`Migration ${arquivo} falhou — as demais não foram testadas.`)
    }
  }
}

async function semear() {
  console.log('\n[1mDados de teste[0m')
  await comoAdministradorDoBanco()

  await db.exec(`
    insert into public.oficinas (id, nome, telefone) values
      ('${ID.oficinaA}', 'Oficina Tiago Carvalho', '(11) 90000-0001'),
      ('${ID.oficinaB}', 'Oficina do Vizinho',     '(11) 90000-0002');

    insert into auth.users (id, email) values
      ('${ID.adminA}',    'admin.a@teste.local'),
      ('${ID.vendedorA}', 'vendedor.a@teste.local'),
      ('${ID.mecanicoA}', 'mecanico.a@teste.local'),
      ('${ID.adminB}',    'admin.b@teste.local');

    insert into public.usuarios (id, oficina_id, nome, email, perfil) values
      ('${ID.adminA}',    '${ID.oficinaA}', 'Tiago',  'admin.a@teste.local',    'admin'),
      ('${ID.vendedorA}', '${ID.oficinaA}', 'Bruna',  'vendedor.a@teste.local', 'vendedor'),
      ('${ID.mecanicoA}', '${ID.oficinaA}', 'Jorge',  'mecanico.a@teste.local', 'mecanico'),
      ('${ID.adminB}',    '${ID.oficinaB}', 'Vizinho','admin.b@teste.local',    'admin');

    insert into public.clientes (id, oficina_id, nome, telefone) values
      ('${ID.clienteA}', '${ID.oficinaA}', 'Carlos da Silva', '(11) 98888-1111'),
      ('${ID.clienteB}', '${ID.oficinaB}', 'Beto Vizinho',    '(11) 97777-2222');

    insert into public.motos (id, oficina_id, placa, marca, modelo, km_atual) values
      ('${ID.motoA}', '${ID.oficinaA}', 'abc1d23', 'Honda',  'CG 160', 12000),
      ('${ID.motoB}', '${ID.oficinaB}', 'XYZ-9876','Yamaha', 'Fazer 250', 30000);

    insert into public.moto_proprietarios (oficina_id, moto_id, cliente_id) values
      ('${ID.oficinaA}', '${ID.motoA}', '${ID.clienteA}'),
      ('${ID.oficinaB}', '${ID.motoB}', '${ID.clienteB}');

    insert into public.produtos (id, oficina_id, nome, preco_custo, preco_venda, estoque_atual) values
      ('${ID.produtoA}', '${ID.oficinaA}', 'Óleo 10W30', 22.00, 45.00, 10),
      ('${ID.produtoB}', '${ID.oficinaB}', 'Pastilha de freio', 30.00, 79.90, 5);

    insert into public.servicos (id, oficina_id, nome, preco, tempo_estimado_minutos) values
      ('${ID.servicoA}', '${ID.oficinaA}', 'Troca de óleo', 60.00, 30),
      ('${ID.servicoB}', '${ID.oficinaB}', 'Revisão geral', 250.00, 180);

    insert into public.contas_receber (oficina_id, cliente_id, descricao, valor, vencimento) values
      ('${ID.oficinaA}', '${ID.clienteA}', 'OS 1', 105.00, current_date);
  `)
  ok('duas oficinas com cliente, moto, produto, serviço e conta a receber')

  const placa = await db.query<{ placa: string }>(
    `select placa from public.motos where id = '${ID.motoA}'`,
  )
  if (placa.rows[0].placa === 'ABC1D23') ok('placa normalizada no banco: "abc1d23" virou "ABC1D23"')
  else erro('normalização de placa', `veio "${placa.rows[0].placa}"`)
}

async function testarIsolamentoEntreOficinas() {
  console.log('\n[1mIsolamento entre oficinas — logado como admin da Oficina A[0m')
  await logarComo(ID.adminA)

  await esperaLinhas('só enxerga a própria oficina', 'select count(*) as n from public.oficinas', 1)
  await esperaLinhas('só enxerga clientes da oficina A', 'select count(*) as n from public.clientes', 1)
  await esperaLinhas('só enxerga motos da oficina A', 'select count(*) as n from public.motos', 1)
  await esperaLinhas('só enxerga produtos da oficina A', 'select count(*) as n from public.produtos', 1)
  await esperaLinhas('só enxerga serviços da oficina A', 'select count(*) as n from public.servicos', 1)
  await esperaLinhas('só enxerga a equipe da oficina A', 'select count(*) as n from public.usuarios', 3)

  await esperaLinhas(
    'não lê o cliente da oficina B nem pelo id exato',
    `select count(*) as n from public.clientes where id = '${ID.clienteB}'`,
    0,
  )
  await esperaLinhas(
    'não lê a moto da oficina B pela placa',
    `select count(*) as n from public.motos where placa = 'XYZ9876'`,
    0,
  )
  await esperaLinhas(
    'não lê o produto da oficina B pela view do catálogo',
    `select count(*) as n from public.vw_produtos where id = '${ID.produtoB}'`,
    0,
  )

  await esperaBloqueio(
    'não altera o cliente da oficina B',
    `update public.clientes set nome = 'invadido' where id = '${ID.clienteB}'`,
  )
  await esperaBloqueio(
    'não altera o preço do produto da oficina B',
    `update public.produtos set preco_venda = 0.01 where id = '${ID.produtoB}'`,
  )
  await esperaBloqueio(
    'não apaga o cliente da oficina B',
    `delete from public.clientes where id = '${ID.clienteB}'`,
  )
  await esperaBloqueio(
    'não apaga a moto da oficina B',
    `delete from public.motos where id = '${ID.motoB}'`,
  )
  await esperaBloqueio(
    'não altera os dados cadastrais da oficina B',
    `update public.oficinas set nome = 'invadido' where id = '${ID.oficinaB}'`,
  )
  await esperaErro(
    'não grava cliente dentro da oficina B',
    `insert into public.clientes (oficina_id, nome) values ('${ID.oficinaB}', 'Infiltrado')`,
  )
  await esperaErro(
    'não move a própria moto para a oficina B',
    `update public.motos set oficina_id = '${ID.oficinaB}' where id = '${ID.motoA}'`,
  )
  // data_fim preenchida para não esbarrar antes no índice de "um dono atual por
  // moto" — o que se quer provar aqui é a chave estrangeira composta, que impede
  // a referência cruzada entre oficinas.
  await esperaErro(
    'não vincula a moto da oficina A a um cliente da oficina B',
    `insert into public.moto_proprietarios (oficina_id, moto_id, cliente_id, data_inicio, data_fim)
     values ('${ID.oficinaA}', '${ID.motoA}', '${ID.clienteB}', current_date - 10, current_date - 1)`,
  )

  console.log('\n[1mE o caminho inverso — logado como admin da Oficina B[0m')
  await logarComo(ID.adminB)
  await esperaLinhas('só enxerga clientes da oficina B', 'select count(*) as n from public.clientes', 1)
  await esperaLinhas(
    'não lê o cliente da oficina A',
    `select count(*) as n from public.clientes where id = '${ID.clienteA}'`,
    0,
  )
  await esperaLinhas('não lê nenhuma conta a receber da oficina A', 'select count(*) as n from public.contas_receber', 0)
}

async function testarPerfilVendedor() {
  console.log('\n[1mPerfil vendedor (oficina A)[0m')
  await logarComo(ID.vendedorA)

  await esperaLinhas('enxerga os clientes da oficina', 'select count(*) as n from public.clientes', 1)
  await esperaLinhas('enxerga as motos da oficina', 'select count(*) as n from public.motos', 1)
  await esperaLinhas('enxerga os serviços da oficina', 'select count(*) as n from public.servicos', 1)
  await esperaLinhas('cadastra cliente', 'select count(*) as n from public.clientes', 1)

  await esperaLinhas(
    'NÃO lê a tabela produtos, que carrega o preço de custo',
    'select count(*) as n from public.produtos',
    0,
  )
  await esperaLinhas(
    'lê o catálogo pela view, sem custo',
    'select count(*) as n from public.vw_produtos',
    1,
  )
  await esperaErro(
    'a view não expõe a coluna preco_custo',
    'select preco_custo from public.vw_produtos',
  )
  await esperaLinhas('NÃO enxerga financeiro', 'select count(*) as n from public.contas_receber', 0)
  await esperaErro(
    'NÃO lança conta a receber',
    `insert into public.contas_receber (oficina_id, descricao, valor, vencimento)
     values ('${ID.oficinaA}', 'teste', 10, current_date)`,
  )
  await esperaErro(
    'NÃO cadastra produto',
    `insert into public.produtos (oficina_id, nome) values ('${ID.oficinaA}', 'Peça pirata')`,
  )
  await esperaErro(
    'NÃO cria colaborador',
    `insert into public.usuarios (id, oficina_id, nome, email, perfil)
     values ('${ID.adminB}', '${ID.oficinaA}', 'Falso', 'falso@teste.local', 'admin')`,
  )
  await esperaErro(
    'NÃO se promove a admin',
    `update public.usuarios set perfil = 'admin' where id = '${ID.vendedorA}'`,
  )
  // Um UPDATE barrado pelo USING da política não levanta erro: ele simplesmente
  // não encontra linha. O efeito é o mesmo — nada muda — e é isso que se verifica.
  await esperaBloqueio(
    'NÃO edita as configurações da oficina',
    `update public.oficinas set chave_pix = '11999999999' where id = '${ID.oficinaA}'`,
  )

  // O que ele PODE: corrigir o próprio nome.
  try {
    await db.query(`update public.usuarios set nome = 'Bruna Alves' where id = '${ID.vendedorA}'`)
    ok('corrige o próprio nome')
  } catch (e) {
    erro('corrige o próprio nome', (e as Error).message)
  }
}

async function testarPerfilMecanico() {
  console.log('\n[1mPerfil mecânico (oficina A, sem OS atribuída)[0m')
  await logarComo(ID.mecanicoA)

  await esperaLinhas('NÃO enxerga clientes', 'select count(*) as n from public.clientes', 0)
  await esperaLinhas('NÃO enxerga motos', 'select count(*) as n from public.motos', 0)
  await esperaLinhas('NÃO enxerga a tabela de produtos', 'select count(*) as n from public.produtos', 0)
  await esperaLinhas('NÃO enxerga o catálogo pela view', 'select count(*) as n from public.vw_produtos', 0)
  await esperaLinhas('NÃO enxerga financeiro', 'select count(*) as n from public.contas_receber', 0)
  await esperaLinhas('enxerga apenas o próprio cadastro na equipe', 'select count(*) as n from public.usuarios', 1)
  await esperaLinhas('enxerga os serviços ativos, para saber o que executar', 'select count(*) as n from public.servicos', 1)
  await esperaLinhas('NÃO tem nenhuma ordem de serviço', 'select count(*) as n from public.ordens_servico', 0)
  await esperaErro(
    'NÃO cadastra cliente',
    `insert into public.clientes (oficina_id, nome) values ('${ID.oficinaA}', 'Cliente do mecânico')`,
  )

  console.log('\n[1mMecânico com uma OS atribuída[0m')
  await comoAdministradorDoBanco()
  await db.exec(`
    insert into public.ordens_servico (oficina_id, numero, cliente_id, moto_id, responsavel_id)
    values ('${ID.oficinaA}', 1, '${ID.clienteA}', '${ID.motoA}', '${ID.mecanicoA}');
    insert into public.ordens_servico (oficina_id, numero, cliente_id, moto_id, responsavel_id)
    values ('${ID.oficinaA}', 2, '${ID.clienteA}', '${ID.motoA}', null);
  `)
  await logarComo(ID.mecanicoA)
  // A tabela tem dinheiro, então ele não a lê mais — nem para ver a ordem dele.
  await esperaLinhas(
    'não lê a tabela de ordens, que tem valor e desconto',
    'select count(*) as n from public.ordens_servico',
    0,
  )
  const minhas = await ordensDoMecanico()
  minhas.length === 1
    ? ok('recebe pela função dele só a OS atribuída a ele, não as duas')
    : erro('ordens do mecânico', `veio ${minhas.length}`)

  const semDinheiro = minhas.every(
    (o) => !('valor_total' in o) && !('desconto' in o),
  )
  semDinheiro
    ? ok('e o que chega até ele não tem valor nenhum')
    : erro('vazamento de valor', JSON.stringify(minhas[0]))
  await esperaLinhas('passa a enxergar o cliente daquela OS', 'select count(*) as n from public.clientes', 1)
  await esperaLinhas('passa a enxergar a moto daquela OS', 'select count(*) as n from public.motos', 1)
  await esperaLinhas('continua sem enxergar o preço de custo', 'select count(*) as n from public.produtos', 0)
  await esperaBloqueio(
    'não passa a OS para outro responsável',
    `update public.ordens_servico set responsavel_id = null where responsavel_id = '${ID.mecanicoA}'`,
  )
}

async function testarRegrasDeNegocio() {
  console.log('\n[1mRegras de negócio[0m')
  await logarComo(ID.adminA)

  await esperaErro(
    'placa fora do padrão brasileiro é recusada',
    `insert into public.motos (oficina_id, placa) values ('${ID.oficinaA}', 'MOTO1')`,
  )
  await esperaErro(
    'placa repetida dentro da mesma oficina é recusada',
    `insert into public.motos (oficina_id, placa) values ('${ID.oficinaA}', 'ABC1D23')`,
  )

  // A mesma placa em outra oficina é permitida: a moto pode rodar as duas.
  await comoAdministradorDoBanco()
  try {
    await db.exec(
      `insert into public.motos (oficina_id, placa) values ('${ID.oficinaB}', 'ABC1D23')`,
    )
    ok('a mesma placa pode existir em outra oficina')
  } catch (e) {
    erro('a mesma placa pode existir em outra oficina', (e as Error).message)
  }

  await logarComo(ID.adminA)
  try {
    const r = await db.query<{ id: string; placa: string }>(
      `select * from public.criar_moto_com_proprietario($1, $2, $3, $4)`,
      [ID.clienteA, 'ker2b18', 'Honda', 'Biz 125'],
    )
    const vinculo = await contar(
      `select count(*) as n from public.moto_proprietarios where moto_id = '${r.rows[0].id}'`,
    )
    if (vinculo === 1) ok('a moto e o vínculo com o dono nascem na mesma transação')
    else erro('cadastro de moto com dono', `esperava 1 vínculo, veio ${vinculo}`)
  } catch (e) {
    erro('cadastro de moto com dono', (e as Error).message)
  }

  // Regressão: inserção em lote onde uma linha omite data_inicio. O PostgREST
  // manda NULL nesse caso, e NULL não aciona o default da coluna — o lote
  // inteiro caía com "violates not-null constraint". Ver migration 0015.
  await comoAdministradorDoBanco()
  try {
    await db.exec(`
      insert into public.moto_proprietarios (oficina_id, moto_id, cliente_id, data_inicio)
      values ('${ID.oficinaA}', '${ID.motoA}', '${ID.clienteA}', null)
      on conflict do nothing
    `)
    const n = await contar(`
      select count(*) as n from public.moto_proprietarios
      where moto_id = '${ID.motoA}' and data_inicio = current_date
    `)
    if (n >= 1) ok('linha sem data de início recebe a data de hoje, em vez de quebrar')
    else erro('default resistente a lote', 'a data de início não foi preenchida')
  } catch (e) {
    erro('default resistente a lote', (e as Error).message)
  }

  await logarComo(ID.adminA)
  await esperaErro(
    'a oficina não pode ficar sem administrador ativo',
    `update public.usuarios set ativo = false where id = '${ID.adminA}'`,
  )

  const semRls = await contar(`
    select count(*) as n
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  `)
  if (semRls === 0) ok('nenhuma tabela do schema public está sem RLS')
  else erro('cobertura de RLS', `${semRls} tabela(s) sem RLS`)
}

/** Lê o saldo do produto direto da coluna que o gatilho mantém. */
/**
 * As ordens como o mecânico as recebe: pela função do banco, sem passar por
 * nenhuma tabela com dinheiro. É assim que a tela dele funciona desde a 0033.
 */
async function ordensDoMecanico(): Promise<Array<{ id: string; status: string }>> {
  const r = await db.query<{ j: Array<{ id: string; status: string }> }>(
    'select public.ordens_do_mecanico() as j',
  )
  return r.rows[0].j
}

async function saldo(produtoId: string): Promise<number> {
  return contar(`select estoque_atual as n from public.produtos where id = '${produtoId}'`)
}

async function testarEstoque() {
  console.log('\n\x1b[1mEstoque — o saldo é a soma das movimentações\x1b[0m')
  await logarComo(ID.adminA)

  const inicial = await saldo(ID.produtoA)

  await db.query(`select public.registrar_movimentacao($1, 'entrada', 10, 'Compra no fornecedor')`, [ID.produtoA])
  const aposEntrada = await saldo(ID.produtoA)
  aposEntrada === inicial + 10
    ? ok(`entrada de 10 sobe o saldo (${inicial} → ${aposEntrada})`)
    : erro('entrada', `esperava ${inicial + 10}, veio ${aposEntrada}`)

  await db.query(`select public.registrar_movimentacao($1, 'saida', 3, 'Usado no serviço')`, [ID.produtoA])
  const aposSaida = await saldo(ID.produtoA)
  aposSaida === aposEntrada - 3
    ? ok(`saída de 3 desce o saldo (${aposEntrada} → ${aposSaida})`)
    : erro('saída', `esperava ${aposEntrada - 3}, veio ${aposSaida}`)

  // O que o critério de aceite chama de "me impede de deixar o estoque negativo".
  try {
    await db.query(`select public.registrar_movimentacao($1, 'saida', 999, 'Tentativa absurda')`, [ID.produtoA])
    erro('bloqueio de estoque negativo', 'a saída passou e deixaria o estoque negativo')
  } catch (e) {
    const msg = (e as Error).message
    // A mensagem tem que sair legível: sem ponto solto depois do número e com
    // vírgula como separador decimal, que é como se escreve em português.
    const limpa = msg.includes('Não há estoque suficiente') && !/\d\. /.test(msg)
    limpa
      ? ok(`saída maior que o saldo é recusada: "${msg.split('\n')[0].slice(0, 70)}"`)
      : erro('bloqueio de estoque negativo', `recusou, mas a mensagem saiu torta: ${msg}`)
  }

  const antesDoAjuste = await saldo(ID.produtoA)
  await db.query(`select public.registrar_movimentacao($1, 'ajuste', -2, 'Contagem do mês')`, [ID.produtoA])
  const aposAjuste = await saldo(ID.produtoA)
  aposAjuste === antesDoAjuste - 2
    ? ok('ajuste negativo corrige o saldo para baixo')
    : erro('ajuste', `esperava ${antesDoAjuste - 2}, veio ${aposAjuste}`)

  await esperaErro(
    'movimentação sem motivo é recusada',
    `select public.registrar_movimentacao('${ID.produtoA}', 'entrada', 1, '   ')`,
  )
  await esperaErro(
    'entrada com quantidade negativa é recusada',
    `insert into public.movimentacoes_estoque (oficina_id, produto_id, tipo, quantidade, motivo)
     values ('${ID.oficinaA}', '${ID.produtoA}', 'entrada', -5, 'x')`,
  )

  // Apagar uma movimentação tem que desfazer o efeito dela.
  const antesDoApagar = await saldo(ID.produtoA)
  await db.exec(`delete from public.movimentacoes_estoque
                 where produto_id = '${ID.produtoA}' and tipo = 'saida' and quantidade = 3`)
  const aposApagar = await saldo(ID.produtoA)
  aposApagar === antesDoApagar + 3
    ? ok('apagar uma saída devolve a quantidade ao saldo')
    : erro('apagar movimentação', `esperava ${antesDoApagar + 3}, veio ${aposApagar}`)

  // Ninguém escreve no saldo direto: o único caminho é a movimentação.
  await esperaErro(
    'editar estoque_atual direto no cadastro é recusado',
    `update public.produtos set estoque_atual = 999 where id = '${ID.produtoA}'`,
  )

  // Produto novo com estoque já vira movimentação de saldo inicial, senão o
  // extrato nasceria discordando do saldo.
  await db.exec(`insert into public.produtos (id, oficina_id, nome, estoque_atual, preco_venda)
                 values ('e9999999-1111-4111-8111-111111111111', '${ID.oficinaA}', 'Peça com saldo inicial', 7, 10)`)
  const inicialRegistrado = await contar(
    `select count(*) as n from public.movimentacoes_estoque
     where produto_id = 'e9999999-1111-4111-8111-111111111111'
       and tipo = 'ajuste' and quantidade = 7 and motivo = 'Saldo inicial do cadastro'`,
  )
  const saldoNovo = await saldo('e9999999-1111-4111-8111-111111111111')
  inicialRegistrado === 1 && saldoNovo === 7
    ? ok('produto cadastrado com estoque gera a movimentação de saldo inicial')
    : erro('saldo inicial', `movimentação ${inicialRegistrado}, saldo ${saldoNovo}`)

  // A prova do invariante: recalcular do zero tem que dar o mesmo número.
  const cacheado = await saldo(ID.produtoA)
  const recalculado = await contar(`select public.recalcular_estoque('${ID.produtoA}') as n`)
  cacheado === recalculado
    ? ok(`o saldo em cache bate com a soma do extrato (${cacheado})`)
    : erro('invariante do estoque', `cache ${cacheado}, extrato ${recalculado}`)
}

async function testarNotaFiscal() {
  console.log('\n\x1b[1mNota fiscal — entrada e estorno\x1b[0m')
  await logarComo(ID.adminA)

  const antes = await saldo(ID.produtoA)
  const nota = await db.query<{ id: string }>(
    `select public.salvar_nota_com_itens('1234', 'Distribuidora Moto', current_date, 500,
       null, $1::jsonb) as id`,
    [JSON.stringify([{ produto_id: ID.produtoA, quantidade: 12, custo_unitario: 21.5 }])],
  )
  const notaId = nota.rows[0].id
  const aposNota = await saldo(ID.produtoA)
  aposNota === antes + 12
    ? ok(`os itens da nota entram no estoque (${antes} → ${aposNota})`)
    : erro('entrada por nota', `esperava ${antes + 12}, veio ${aposNota}`)

  await db.query(`select public.cancelar_nota($1)`, [notaId])
  const aposCancelar = await saldo(ID.produtoA)
  aposCancelar === antes
    ? ok(`cancelar a nota devolve o estoque ao que era (${aposCancelar})`)
    : erro('estorno da nota', `esperava ${antes}, veio ${aposCancelar}`)

  const movimentacoes = await contar(
    `select count(*) as n from public.movimentacoes_estoque where nota_fiscal_id = '${notaId}'`,
  )
  movimentacoes === 2
    ? ok('o estorno não apaga a entrada: guarda as duas linhas no extrato')
    : erro('rastro do estorno', `esperava 2 movimentações, veio ${movimentacoes}`)

  await esperaErro('cancelar a mesma nota duas vezes é recusado', `select public.cancelar_nota('${notaId}')`)
}

async function testarOrcamento() {
  console.log('\n\x1b[1mOrçamento — numeração, itens e aprovação\x1b[0m')
  await logarComo(ID.adminA)

  const itens = JSON.stringify([
    { tipo: 'produto', produto_id: ID.produtoA, servico_id: null, descricao: 'Óleo 10W30', quantidade: 2, valor_unitario: 45 },
    { tipo: 'servico', produto_id: null, servico_id: ID.servicoA, descricao: 'Troca de óleo', quantidade: 1, valor_unitario: 60 },
    { tipo: 'avulso', produto_id: null, servico_id: null, descricao: 'Solda no escapamento', quantidade: 1, valor_unitario: 40 },
  ])

  const criado = await db.query<{ id: string }>(
    `select public.salvar_orcamento_com_itens(null, '${ID.clienteA}', '${ID.motoA}', 24500,
       7, 90, 'Cliente pediu urgência', 20, null, $1::jsonb) as id`,
    [itens],
  )
  const orcamentoId = criado.rows[0].id
  ORCAMENTO_DA_A.id = orcamentoId

  const total = await contar(`select valor_total as n from public.orcamentos where id = '${orcamentoId}'`)
  total === 170
    ? ok('total calculado no banco: 2×45 + 60 + 40 = 190, menos 20 de desconto = 170')
    : erro('total do orçamento', `esperava 170, veio ${total}`)

  await esperaLinhas(
    'item avulso é aceito sem produto nem serviço',
    `select count(*) as n from public.orcamento_itens where orcamento_id = '${orcamentoId}' and tipo = 'avulso'`,
    1,
  )

  const km = await contar(`select km_atual as n from public.motos where id = '${ID.motoA}'`)
  km === 24500 ? ok('a quilometragem do orçamento atualiza a moto') : erro('km da moto', `veio ${km}`)

  const validade = await contar(
    `select (validade_ate - current_date) as n from public.orcamentos where id = '${orcamentoId}'`,
  )
  validade === 7 ? ok('validade gravada como data, 7 dias à frente') : erro('validade', `veio ${validade} dias`)

  // Numeração por oficina: a A segue a contagem dela, a B começa do 1.
  const numeroA = await contar(`select numero as n from public.orcamentos where id = '${orcamentoId}'`)
  numeroA === 1 ? ok('primeiro orçamento da oficina A é o número 1') : erro('numeração', `veio ${numeroA}`)

  const segundo = await db.query<{ id: string }>(
    `select public.salvar_orcamento_com_itens(null, '${ID.clienteA}', '${ID.motoA}', 24500,
       7, 90, null, 0, null, $1::jsonb) as id`,
    [itens],
  )
  const numeroSegundo = await contar(
    `select numero as n from public.orcamentos where id = '${segundo.rows[0].id}'`,
  )
  numeroSegundo === 2 ? ok('o segundo orçamento da oficina A é o número 2') : erro('numeração', `veio ${numeroSegundo}`)

  await logarComo(ID.adminB)
  const daB = await db.query<{ id: string }>(
    `select public.salvar_orcamento_com_itens(null, '${ID.clienteB}', '${ID.motoB}', 31000,
       7, 90, null, 0, null, '[]'::jsonb) as id`,
  )
  const numeroB = await contar(`select numero as n from public.orcamentos where id = '${daB.rows[0].id}'`)
  numeroB === 1
    ? ok('a oficina B tem a numeração dela: também começa no 1')
    : erro('numeração por oficina', `a oficina B veio com o número ${numeroB}`)

  // Aprovação
  await logarComo(ID.adminA)
  const estoqueAntes = await saldo(ID.produtoA)
  const os = await db.query<{ id: string }>(
    `select public.aprovar_orcamento('${orcamentoId}', '${ID.mecanicoA}') as id`,
  )
  const osId = os.rows[0].id

  await esperaLinhas(
    'a OS nasce com os três itens copiados',
    `select count(*) as n from public.os_itens where ordem_servico_id = '${osId}'`,
    3,
  )
  await esperaLinhas(
    'a OS nasce aberta e com responsável',
    `select count(*) as n from public.ordens_servico
     where id = '${osId}' and status = 'aberta' and responsavel_id = '${ID.mecanicoA}'`,
    1,
  )
  const garantia = await contar(
    `select (garantia_ate - current_date) as n from public.ordens_servico where id = '${osId}'`,
  )
  garantia === 90 ? ok('garantia gravada 90 dias à frente da aprovação') : erro('garantia', `veio ${garantia}`)

  const estoqueDepois = await saldo(ID.produtoA)
  estoqueDepois === estoqueAntes
    ? ok(`aprovar NÃO mexe no estoque (${estoqueAntes} antes e depois)`)
    : erro('estoque na aprovação', `mudou de ${estoqueAntes} para ${estoqueDepois}`)

  await esperaErro(
    'orçamento aprovado não pode mais ser editado',
    `select public.salvar_orcamento_com_itens('${orcamentoId}', '${ID.clienteA}', '${ID.motoA}',
       24500, 7, 90, 'tentando mudar', 0, null, '[]'::jsonb)`,
  )
  await esperaErro(
    'orçamento aprovado não pode ser aprovado de novo',
    `select public.aprovar_orcamento('${orcamentoId}', '${ID.adminA}')`,
  )

  // O desconto tem que atravessar a aprovação -------------------------------
  // Este bloco existe por causa de um defeito real: a OS copiava os itens e
  // esquecia o desconto, e a ordem passava a valer mais do que o cliente
  // aceitou. O centavo aqui não é preciosismo — é o que vai para a cobrança.
  console.log('\n\x1b[1mO desconto atravessa a aprovação\x1b[0m')

  const comDesconto = await db.query<{ id: string }>(
    `select public.salvar_orcamento_com_itens(null, '${ID.clienteA}', '${ID.motoA}', 24500,
       7, 90, null, $2::numeric, 15.21, $1::jsonb) as id`,
    // 15,21% sobre a soma dos itens (190), do mesmo jeito que a tela calcula:
    // ela manda o percentual e o valor em reais que ele dá, sobre a mesma soma.
    [itens, 190 * 0.1521],
  )
  const orcDesconto = comDesconto.rows[0].id
  const totalOrcado = await contar(
    `select (valor_total * 100)::int as n from public.orcamentos where id = '${orcDesconto}'`,
  )

  // Direcionada ao admin de propósito: responsável pode ser qualquer perfil, e
  // assim este bloco não muda a conta de OS do mecânico que outro teste confere.
  const osDesconto = await db.query<{ id: string }>(
    `select public.aprovar_orcamento('${orcDesconto}', '${ID.adminA}') as id`,
  )
  const osDescontoId = osDesconto.rows[0].id

  const totalDaOs = await contar(
    `select (valor_total * 100)::int as n from public.ordens_servico where id = '${osDescontoId}'`,
  )
  totalDaOs === totalOrcado
    ? ok(`a OS nasce com o valor aprovado, ao centavo (R$ ${(totalDaOs / 100).toFixed(2)})`)
    : erro('valor da OS', `orçamento ${totalOrcado}, OS ${totalDaOs}`)

  await esperaLinhas(
    'a OS guarda o desconto como percentual, e não em reais',
    `select count(*) as n from public.ordens_servico
     where id = '${osDescontoId}' and desconto_tipo = 'percentual' and desconto = 15.21`,
    1,
  )

  // Peça a mais no meio do serviço: o percentual acompanha a soma nova.
  await db.query(
    `insert into public.os_itens
       (oficina_id, ordem_servico_id, tipo, descricao, quantidade, valor_unitario, valor_total)
     values ('${ID.oficinaA}', '${osDescontoId}', 'avulso', 'Peça que apareceu no meio', 1, 100, 100)`,
  )
  const totalDepois = await contar(
    `select (valor_total * 100)::int as n from public.ordens_servico where id = '${osDescontoId}'`,
  )
  // (190 + 100) menos 15,21% = 245,891 → 245,89
  totalDepois === 24589
    ? ok('acrescentar item recalcula o total, e o desconto percentual acompanha')
    : erro('recálculo da OS', `esperava 24589 centavos, veio ${totalDepois}`)

  await db.query(
    `delete from public.os_itens where ordem_servico_id = '${osDescontoId}' and tipo = 'avulso' and valor_unitario = 100`,
  )
  const totalDeVolta = await contar(
    `select (valor_total * 100)::int as n from public.ordens_servico where id = '${osDescontoId}'`,
  )
  totalDeVolta === totalOrcado
    ? ok('remover o item devolve o total ao valor aprovado')
    : erro('recálculo ao remover', `esperava ${totalOrcado}, veio ${totalDeVolta}`)

  // Duplicar
  const copia = await db.query<{ id: string }>(`select public.duplicar_orcamento('${orcamentoId}') as id`)
  await esperaLinhas(
    'duplicar traz os itens e volta para rascunho',
    `select count(*) as n from public.orcamentos o
     join public.orcamento_itens i on i.orcamento_id = o.id
     where o.id = '${copia.rows[0].id}' and o.status = 'rascunho'`,
    3,
  )
}

async function testarCicloDaOs() {
  console.log('\n\x1b[1mO ciclo da ordem de serviço\x1b[0m')
  await logarComo(ID.adminA)

  const itens = JSON.stringify([
    { tipo: 'produto', produto_id: ID.produtoA, servico_id: null, descricao: 'Óleo 10W30', quantidade: 1, valor_unitario: 45 },
    { tipo: 'servico', produto_id: null, servico_id: ID.servicoA, descricao: 'Troca de óleo', quantidade: 1, valor_unitario: 60 },
  ])
  const orc = await db.query<{ id: string }>(
    `select public.salvar_orcamento_com_itens(null, '${ID.clienteA}', '${ID.motoA}', 25000,
       7, 90, null, 0, null, $1::jsonb) as id`,
    [itens],
  )
  const os = await db.query<{ id: string }>(
    `select public.aprovar_orcamento('${orc.rows[0].id}', '${ID.mecanicoA}') as id`,
  )
  const osId = os.rows[0].id

  await esperaLinhas(
    'a ordem já nasce com a primeira linha de histórico',
    `select count(*) as n from public.os_status_historico
     where ordem_servico_id = '${osId}' and de is null and para = 'aberta'`,
    1,
  )

  await esperaErro(
    'não dá para pular de aberta direto para entregue',
    `update public.ordens_servico set status = 'entregue' where id = '${osId}'`,
  )
  await esperaErro(
    'nem de aberta para finalizada, sem passar pelo serviço',
    `update public.ordens_servico set status = 'finalizada' where id = '${osId}'`,
  )

  // O mecânico toca no que é dele -------------------------------------------
  await logarComo(ID.mecanicoA)
  await db.query(`select public.mudar_status_da_os('${osId}', 'em_andamento')`)
  const comecada = (await ordensDoMecanico()).find((o) => o.id === osId)
  comecada?.status === 'em_andamento'
    ? ok('o mecânico começa o serviço')
    : erro('início do serviço', `status ${comecada?.status ?? 'sumiu da lista'}`)
  await db.query(`select public.mudar_status_da_os('${osId}', 'pausada')`)
  await db.query(`select public.mudar_status_da_os('${osId}', 'em_andamento')`)
  await esperaLinhas(
    'pausar e retomar deixam rastro de quem foi',
    `select count(*) as n from public.os_status_historico
     where ordem_servico_id = '${osId}' and usuario_id = '${ID.mecanicoA}'`,
    3,
  )

  // Pela porta certa, de propósito: assim o teste bate na regra do perfil, e
  // não na trava do fechamento — que é a de fora e responderia primeiro.
  await esperaErro(
    'o mecânico NÃO finaliza a ordem — quem confere é quem finaliza',
    `select public.finalizar_os('${osId}')`,
  )
  await esperaErro(
    'o mecânico NÃO cancela a ordem',
    `select public.cancelar_os('${osId}')`,
  )

  await db.query(`select public.mudar_status_da_os('${osId}', 'aguardando_conferencia')`)
  const pronta = (await ordensDoMecanico()).find((o) => o.id === osId)
  pronta?.status === 'aguardando_conferencia'
    ? ok('o mecânico marca como pronta para conferência')
    : erro('pronta para conferência', `status ${pronta?.status ?? 'sumiu da lista'}`)

  // Conferência e fechamento -------------------------------------------------
  await logarComo(ID.adminA)
  await db.query(
    `insert into public.os_itens (oficina_id, ordem_servico_id, tipo, descricao, quantidade, valor_unitario, valor_total)
     values ('${ID.oficinaA}', '${osId}', 'avulso', 'Faltou apertar isto', 1, 10, 10)`,
  )
  await esperaLinhas(
    'na conferência ainda dá para acrescentar o que faltou',
    `select (valor_total * 100)::int as n from public.ordens_servico where id = '${osId}'`,
    11500,
  )

  await esperaErro(
    'update direto para finalizada não passa: baixaria a ordem sem baixar peça',
    `update public.ordens_servico set status = 'finalizada' where id = '${osId}'`,
  )
  await db.query(`select public.finalizar_os('${osId}')`)
  await esperaErro(
    'ordem finalizada não aceita mais item novo',
    `insert into public.os_itens (oficina_id, ordem_servico_id, tipo, descricao, quantidade, valor_unitario, valor_total)
     values ('${ID.oficinaA}', '${osId}', 'avulso', 'Tarde demais', 1, 10, 10)`,
  )
  await esperaErro(
    'nem que seja para apagar um item',
    `delete from public.os_itens where ordem_servico_id = '${osId}' and tipo = 'avulso'`,
  )

  await db.query(`select public.mudar_status_da_os('${osId}', 'entregue')`)
  await esperaErro(
    'moto entregue não volta atrás: cancelar já não vale',
    `select public.cancelar_os('${osId}')`,
  )
}

async function testarRelogio() {
  console.log('\n\x1b[1mO relógio segue o andamento da ordem\x1b[0m')
  await logarComo(ID.adminA)

  async function novaOs(): Promise<string> {
    const itens = JSON.stringify([
      { tipo: 'servico', produto_id: null, servico_id: ID.servicoA, descricao: 'Mão de obra', quantidade: 1, valor_unitario: 60 },
    ])
    const orc = await db.query<{ id: string }>(
      `select public.salvar_orcamento_com_itens(null, '${ID.clienteA}', '${ID.motoA}', 27000,
         7, 90, null, 0, null, $1::jsonb) as id`,
      [itens],
    )
    const os = await db.query<{ id: string }>(
      `select public.aprovar_orcamento('${orc.rows[0].id}', '${ID.mecanicoA}') as id`,
    )
    return os.rows[0].id
  }

  const osA = await novaOs()
  const osB = await novaOs()

  await logarComo(ID.mecanicoA)
  await db.query(`select public.mudar_status_da_os('${osA}', 'em_andamento')`)
  await esperaLinhas(
    'começar o serviço liga o relógio sozinho',
    `select count(*) as n from public.apontamentos_tempo
     where ordem_servico_id = '${osA}' and mecanico_id = '${ID.mecanicoA}' and fim is null`,
    1,
  )

  await db.query(`select public.mudar_status_da_os('${osA}', 'pausada')`)
  await esperaLinhas(
    'pausar desliga o relógio',
    `select count(*) as n from public.apontamentos_tempo
     where ordem_servico_id = '${osA}' and fim is null`,
    0,
  )

  await db.query(`select public.mudar_status_da_os('${osA}', 'em_andamento')`)
  await esperaLinhas(
    'retomar abre um intervalo novo, sem apagar o anterior',
    `select count(*) as n from public.apontamentos_tempo where ordem_servico_id = '${osA}'`,
    2,
  )

  // A regra que mais importa: uma moto de cada vez.
  const resposta = await db.query<{ r: { pausou_a_ordem: string | null } }>(
    `select public.mudar_status_da_os('${osB}', 'em_andamento') as r`,
  )
  const numeroPausado = resposta.rows[0].r.pausou_a_ordem
  numeroPausado
    ? ok(`começar outra ordem avisa qual foi pausada (nº ${numeroPausado})`)
    : erro('aviso de ordem pausada', 'veio nulo')

  const deAntes = (await ordensDoMecanico()).find((o) => o.id === osA)
  deAntes?.status === 'pausada'
    ? ok('e a ordem de antes volta para pausada, sem ninguém nela')
    : erro('pausa automática', `status ${deAntes?.status ?? 'sumiu da lista'}`)
  await esperaLinhas(
    'o mecânico fica com um relógio só ligado',
    `select count(*) as n from public.apontamentos_tempo
     where mecanico_id = '${ID.mecanicoA}' and fim is null`,
    1,
  )

  await esperaErro(
    'e o banco recusa um segundo relógio, nem que peçam direto',
    `insert into public.apontamentos_tempo (oficina_id, ordem_servico_id, mecanico_id)
     values ('${ID.oficinaA}', '${osA}', '${ID.mecanicoA}')`,
  )

  const tempo = await db.query<{ rodando_desde: string | null; minutos_estimados: number }>(
    `select * from public.tempo_da_os('${osB}')`,
  )
  tempo.rows[0].rodando_desde
    ? ok('a tela sabe desde quando o relógio está rodando')
    : erro('cronômetro', 'rodando_desde veio nulo')

  const estimado = await contar(`select minutos_estimados as n from public.tempo_da_os('${osB}')`)
  estimado === 30
    ? ok('e quanto o serviço foi estimado, para comparar com o real: 30 min')
    : erro('tempo estimado', `veio ${estimado}`)

  await db.query(`select public.mudar_status_da_os('${osB}', 'aguardando_conferencia')`)
  await esperaLinhas(
    'avisar que terminou também desliga o relógio',
    `select count(*) as n from public.apontamentos_tempo
     where mecanico_id = '${ID.mecanicoA}' and fim is null`,
    0,
  )

  await logarComo(ID.adminA)
}

async function testarMecanicoSemDinheiro() {
  console.log('\n\x1b[1mO mecânico não alcança dinheiro nenhum\x1b[0m')
  await logarComo(ID.mecanicoA)

  const minhas = await ordensDoMecanico()
  if (minhas.length === 0) {
    erro('cenário do mecânico', 'nenhuma ordem no nome dele para testar')
    await logarComo(ID.adminA)
    return
  }
  const osId = minhas[0].id

  await esperaLinhas(
    'não lê a tabela de ordens, onde está o total',
    'select count(*) as n from public.ordens_servico',
    0,
  )
  await esperaLinhas(
    'não lê a tabela de itens, onde está o preço de cada peça',
    'select count(*) as n from public.os_itens',
    0,
  )

  const tela = await db.query<{ j: { itens: Array<Record<string, unknown>> } }>(
    `select public.os_do_mecanico('${osId}') as j`,
  )
  const itens = tela.rows[0].j.itens
  const campos = Object.keys(itens[0] ?? {})
  const temDinheiro = campos.some((c) => /valor|preco|custo|desconto|total/.test(c))
  !temDinheiro
    ? ok(`o que chega na tela dele não tem campo de dinheiro (${campos.join(', ')})`)
    : erro('vazamento na tela do mecânico', campos.join(', '))

  const daOrdem = Object.keys(tela.rows[0].j)
  !daOrdem.some((c) => /valor|desconto/.test(c))
    ? ok('nem a ordem em si traz valor ou desconto')
    : erro('vazamento na ordem', daOrdem.join(', '))

  // Escrever no dinheiro, então, nem pensar.
  //
  // Aqui não basta esperar erro: o RLS que não casa a linha não reclama, apenas
  // atualiza zero linhas em silêncio. O que precisa ser verdade é o valor não
  // ter mudado — seja porque a política não deixou chegar, seja porque o
  // gatilho recusou.
  async function tentarEConferir(
    nome: string,
    escrita: string,
    leitura: string,
  ): Promise<void> {
    await logarComo(ID.adminA)
    const antes = await db.query<{ v: string }>(leitura)
    await logarComo(ID.mecanicoA)
    let recusou = ''
    try {
      await db.query(escrita)
    } catch (e) {
      recusou = (e as Error).message
    }
    await logarComo(ID.adminA)
    const depois = await db.query<{ v: string }>(leitura)
    await logarComo(ID.mecanicoA)

    String(antes.rows[0]?.v) === String(depois.rows[0]?.v)
      ? ok(`${nome}${recusou ? ` (${recusou})` : ' (não alcançou a linha)'}`)
      : erro(nome, `mudou de ${antes.rows[0]?.v} para ${depois.rows[0]?.v}`)
  }

  await tentarEConferir(
    'não muda o valor da ordem',
    `update public.ordens_servico set valor_total = 0 where id = '${osId}'`,
    `select valor_total as v from public.ordens_servico where id = '${osId}'`,
  )
  await tentarEConferir(
    'não muda o preço de um item',
    `update public.os_itens set valor_unitario = 0 where ordem_servico_id = '${osId}'`,
    `select sum(valor_unitario) as v from public.os_itens where ordem_servico_id = '${osId}'`,
  )
  await tentarEConferir(
    'não passa a ordem para outra pessoa',
    `update public.ordens_servico set responsavel_id = '${ID.adminA}' where id = '${osId}'`,
    `select responsavel_id as v from public.ordens_servico where id = '${osId}'`,
  )

  // O que ele PODE: dizer que fez.
  const item = await db.query<{ j: { itens: Array<{ id: string }> } }>(
    `select public.os_do_mecanico('${osId}') as j`,
  )
  const itemId = item.rows[0].j.itens[0].id
  try {
    await db.query(`select public.marcar_item_executado('${itemId}', true)`)
    ok('marca um item como executado')
  } catch (e) {
    erro('marcar item executado', (e as Error).message)
  }

  const depois = await db.query<{ j: { itens: Array<{ executado_em: string | null }> } }>(
    `select public.os_do_mecanico('${osId}') as j`,
  )
  depois.rows[0].j.itens[0].executado_em
    ? ok('e a marca aparece de volta na tela dele')
    : erro('item executado', 'executado_em continuou nulo')

  // Escrever o que viu na moto também é dele — e precisou de função própria,
  // porque um update precisa ler a linha para achá-la.
  try {
    await db.query(
      `select public.salvar_observacoes_tecnicas('${osId}', 'Corrente folgada, ajustei.')`,
    )
    const salvo = await db.query<{ j: { observacoes_tecnicas: string | null } }>(
      `select public.os_do_mecanico('${osId}') as j`,
    )
    salvo.rows[0].j.observacoes_tecnicas === 'Corrente folgada, ajustei.'
      ? ok('escreve a observação técnica, e ela volta na tela')
      : erro('observação técnica', `veio ${salvo.rows[0].j.observacoes_tecnicas}`)
  } catch (e) {
    erro('observação técnica', (e as Error).message)
  }

  // E a ordem de outra pessoa continua fechada.
  await logarComo(ID.adminA)
  const outra = await db.query<{ id: string }>(
    `select id from public.ordens_servico where responsavel_id <> '${ID.mecanicoA}' limit 1`,
  )
  if (outra.rows.length > 0) {
    await logarComo(ID.mecanicoA)
    await esperaErro(
      'a ordem que não é dele nem abre',
      `select public.os_do_mecanico('${outra.rows[0].id}')`,
    )
  }

  await logarComo(ID.adminA)
}

async function testarFechamentoDaOs() {
  console.log('\n\x1b[1mFinalizar e cancelar mexendo no estoque\x1b[0m')
  await logarComo(ID.adminA)

  const saldoInicial = await saldo(ID.produtoA)

  async function novaOs(quantidade: number): Promise<string> {
    const itens = JSON.stringify([
      { tipo: 'produto', produto_id: ID.produtoA, servico_id: null, descricao: 'Óleo 10W30', quantidade, valor_unitario: 45 },
      { tipo: 'servico', produto_id: null, servico_id: ID.servicoA, descricao: 'Mão de obra', quantidade: 1, valor_unitario: 60 },
    ])
    const orc = await db.query<{ id: string }>(
      `select public.salvar_orcamento_com_itens(null, '${ID.clienteA}', '${ID.motoA}', 26000,
         7, 90, null, 0, null, $1::jsonb) as id`,
      [itens],
    )
    const os = await db.query<{ id: string }>(
      `select public.aprovar_orcamento('${orc.rows[0].id}', '${ID.adminA}') as id`,
    )
    await db.query(`select public.mudar_status_da_os('${os.rows[0].id}', 'em_andamento')`)
    return os.rows[0].id
  }

  // 1. Caminho normal: tem peça, finaliza, o estoque baixa --------------------
  const os1 = await novaOs(2)
  await db.query(`select public.finalizar_os('${os1}')`)

  const depois = await saldo(ID.produtoA)
  depois === saldoInicial - 2
    ? ok(`finalizar baixa a peça do estoque (${saldoInicial} → ${depois})`)
    : erro('baixa na finalização', `esperava ${saldoInicial - 2}, veio ${depois}`)

  await esperaLinhas(
    'a saída fica amarrada à ordem, com o número dela no motivo',
    `select count(*) as n from public.movimentacoes_estoque
     where ordem_servico_id = '${os1}' and tipo = 'saida' and motivo like 'Aplicado na OS nº %'`,
    1,
  )
  await esperaLinhas(
    'só a peça baixa: mão de obra não é estoque',
    `select count(*) as n from public.movimentacoes_estoque where ordem_servico_id = '${os1}'`,
    1,
  )

  // 2. Cancelar a ordem finalizada devolve a peça -----------------------------
  await db.query(`select public.cancelar_os('${os1}', 'Cliente desistiu depois de pronta')`)
  const devolvido = await saldo(ID.produtoA)
  devolvido === saldoInicial
    ? ok(`cancelar a ordem finalizada devolve a peça (${depois} → ${devolvido})`)
    : erro('estorno no cancelamento', `esperava ${saldoInicial}, veio ${devolvido}`)

  await esperaLinhas(
    'o estorno é uma entrada nova, e não o apagamento da saída',
    `select count(*) as n from public.movimentacoes_estoque where ordem_servico_id = '${os1}'`,
    2,
  )

  // 3. Sem saldo: diz o que falta e recusa ------------------------------------
  const os2 = await novaOs(saldoInicial + 5)
  await esperaErro(
    'sem peça suficiente, finalizar para e diz o que falta',
    `select public.finalizar_os('${os2}')`,
  )
  const naoMexeu = await saldo(ID.produtoA)
  naoMexeu === saldoInicial
    ? ok('a tentativa recusada não deixou meia baixa para trás')
    : erro('baixa parcial', `saldo foi para ${naoMexeu}`)

  await esperaLinhas(
    'a lista do que falta sai pronta para a tela',
    `select count(*) as n from public.faltas_para_finalizar_os('${os2}')`,
    1,
  )

  // 4. Confirmando, finaliza mesmo assim e deixa o rastro ---------------------
  await db.query(`select public.finalizar_os('${os2}', true)`)
  const negativo = await saldo(ID.produtoA)
  negativo === -5
    ? ok(`finalizar com confirmação aceita o estoque negativo (${negativo})`)
    : erro('estoque negativo', `esperava -5, veio ${negativo}`)

  await esperaLinhas(
    'a movimentação sai marcada, para o dono achar onde o cadastro descolou',
    `select count(*) as n from public.movimentacoes_estoque
     where ordem_servico_id = '${os2}' and motivo like '%saldo insuficiente%'`,
    1,
  )

  // Só a peça que faltou leva a marca. Uma ordem com uma peça em falta e outra
  // sobrando marcava as duas — e marca em peça certa é ruído no extrato.
  const outra = await db.query<{ id: string }>(
    `insert into public.produtos (oficina_id, nome, unidade, preco_custo, preco_venda, estoque_atual)
     values ('${ID.oficinaA}', 'Peça com saldo de sobra', 'un', 5, 20, 30) returning id`,
  )
  // O óleo continua negativo do teste anterior, então ele é a peça em falta.
  const os3 = await novaOs(1)
  await db.query(
    `insert into public.os_itens (oficina_id, ordem_servico_id, tipo, produto_id, descricao, quantidade, valor_unitario, valor_total)
     values ('${ID.oficinaA}', '${os3}', 'produto', '${outra.rows[0].id}', 'Peça com saldo de sobra', 1, 20, 20)`,
  )
  await db.query(`select public.finalizar_os('${os3}', true)`)
  await esperaLinhas(
    'a peça que faltou sai marcada',
    `select count(*) as n from public.movimentacoes_estoque
     where ordem_servico_id = '${os3}' and motivo like '%saldo insuficiente%'`,
    1,
  )
  await esperaLinhas(
    'e a marca NÃO sobra para a peça que tinha saldo',
    `select count(*) as n from public.movimentacoes_estoque
     where ordem_servico_id = '${os3}' and motivo not like '%saldo insuficiente%' and tipo = 'saida'`,
    1,
  )
  // Cancelar uma ordem finalizada com saldo negativo tem de funcionar: a
  // devolução é uma entrada, e entrada nunca piora o estoque de ninguém.
  const antesDoEstorno = await saldo(ID.produtoA)
  await db.query(`select public.cancelar_os('${os3}')`)
  const depoisDoEstorno = await saldo(ID.produtoA)
  depoisDoEstorno === antesDoEstorno + 1
    ? ok(`a peça volta mesmo com o saldo ainda negativo (${antesDoEstorno} → ${depoisDoEstorno})`)
    : erro('estorno com saldo negativo', `esperava ${antesDoEstorno + 1}, veio ${depoisDoEstorno}`)

  // A brecha não fica aberta para o resto do sistema.
  await esperaErro(
    'fora da finalização, a trava do estoque negativo continua de pé',
    `select public.registrar_movimentacao('${ID.produtoA}', 'saida', 1, 'Saída avulsa')`,
  )

  await db.query(`select public.cancelar_os('${os2}')`)
}

async function testarPerfisNaFase2() {
  console.log('\n\x1b[1mQuem alcança o que na Fase 2\x1b[0m')

  await logarComo(ID.vendedorA)
  await esperaLinhas(
    'vendedor NÃO lê a tabela de movimentações, que tem custo',
    'select count(*) as n from public.movimentacoes_estoque',
    0,
  )
  const extrato = await contar('select count(*) as n from public.vw_movimentacoes')
  extrato > 0
    ? ok(`vendedor lê o extrato pela view (${extrato} movimentações)`)
    : erro('extrato do vendedor', 'a view não devolveu nada')
  await esperaErro(
    'a view do extrato não expõe custo_unitario',
    'select custo_unitario from public.vw_movimentacoes',
  )
  await esperaLinhas('vendedor NÃO lê notas fiscais', 'select count(*) as n from public.notas_fiscais_entrada', 0)
  await esperaErro(
    'vendedor NÃO lança nota fiscal',
    `select public.salvar_nota_com_itens('999', 'x', current_date, 10, null,
       '[{"produto_id":"${ID.produtoA}","quantidade":1,"custo_unitario":1}]'::jsonb)`,
  )

  try {
    await db.query(`select public.registrar_movimentacao($1, 'entrada', 1, 'Recebido no balcão')`, [ID.produtoA])
    ok('vendedor PODE lançar movimentação de estoque')
  } catch (e) {
    erro('vendedor lança movimentação', (e as Error).message)
  }
  await esperaErro(
    'vendedor NÃO grava movimentação com custo',
    `insert into public.movimentacoes_estoque (oficina_id, produto_id, tipo, quantidade, motivo, custo_unitario)
     values ('${ID.oficinaA}', '${ID.produtoA}', 'entrada', 1, 'x', 9.9)`,
  )

  await logarComo(ID.mecanicoA)
  await esperaLinhas('mecânico NÃO enxerga orçamento', 'select count(*) as n from public.orcamentos', 0)
  await esperaLinhas('mecânico NÃO enxerga movimentação', 'select count(*) as n from public.vw_movimentacoes', 0)
  // Cinco ordens estão no nome dele. Ele não lê nenhuma pela tabela — que é o
  // ponto — e recebe pela função só as que ainda têm serviço a fazer.
  await esperaLinhas(
    'mecânico NÃO lê a tabela de ordens',
    'select count(*) as n from public.ordens_servico',
    0,
  )
  const dele = await ordensDoMecanico()
  dele.length > 0 && dele.every((o) => ['aberta', 'em_andamento', 'pausada', 'aguardando_conferencia'].includes(o.status))
    ? ok(`recebe pela função dele as ordens em aberto (${dele.length})`)
    : erro('ordens do mecânico', JSON.stringify(dele.map((o) => o.status)))

  console.log('\n\x1b[1mIsolamento das tabelas novas\x1b[0m')
  await logarComo(ID.adminB)
  await esperaLinhas(
    'oficina B não vê orçamento da A',
    `select count(*) as n from public.orcamentos where oficina_id = '${ID.oficinaA}'`,
    0,
  )
  await esperaLinhas(
    'oficina B não vê movimentação da A',
    `select count(*) as n from public.movimentacoes_estoque where oficina_id = '${ID.oficinaA}'`,
    0,
  )
  await esperaLinhas(
    'oficina B não vê nota fiscal da A',
    `select count(*) as n from public.notas_fiscais_entrada where oficina_id = '${ID.oficinaA}'`,
    0,
  )
  await esperaLinhas(
    'oficina B não vê ordem de serviço da A',
    `select count(*) as n from public.ordens_servico where oficina_id = '${ID.oficinaA}'`,
    0,
  )
  // O 'limit 1' de antes pegava o orçamento da própria oficina B, porque o RLS
  // já havia filtrado — o teste passava sem provar nada. Agora aponta para o
  // orçamento da A de propósito.
  await esperaErro(
    'oficina B não aprova orçamento da oficina A',
    `select public.aprovar_orcamento('${ORCAMENTO_DA_A.id}', '${ID.adminB}')`,
  )
}

async function main() {
  console.log('[1m\nValidação do banco — Gestão para Oficinas[0m')
  try {
    await rodarMigrations()
    await semear()
    await testarIsolamentoEntreOficinas()
    await testarPerfilVendedor()
    await testarPerfilMecanico()
    await testarRegrasDeNegocio()
    await testarEstoque()
    await testarNotaFiscal()
    await testarOrcamento()
    await testarCicloDaOs()
    await testarRelogio()
    await testarMecanicoSemDinheiro()
    await testarFechamentoDaOs()
    await testarPerfisNaFase2()
  } catch (e) {
    // Sem isto, um teste que aborta no meio termina com "0 falharam" e passa a
    // impressão de que correu tudo bem — foi o que aconteceu quando a coluna
    // mecanico_id virou responsavel_id.
    erro('execução interrompida', (e as Error).message)
  }

  console.log(`\n[1mResultado:[0m ${passou} passaram, ${falhou} falharam`)
  if (falhas.length) {
    console.log('\nFalhas:')
    falhas.forEach((f) => console.log(`  - ${f}`))
  }
  await db.close()
  process.exit(falhou === 0 ? 0 : 1)
}

void main()
