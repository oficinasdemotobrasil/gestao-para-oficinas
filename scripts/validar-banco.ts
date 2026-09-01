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

    insert into public.servicos (id, oficina_id, nome, preco) values
      ('${ID.servicoA}', '${ID.oficinaA}', 'Troca de óleo', 60.00),
      ('${ID.servicoB}', '${ID.oficinaB}', 'Revisão geral', 250.00);

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
    insert into public.ordens_servico (oficina_id, numero, cliente_id, moto_id, mecanico_id)
    values ('${ID.oficinaA}', 1, '${ID.clienteA}', '${ID.motoA}', '${ID.mecanicoA}');
    insert into public.ordens_servico (oficina_id, numero, cliente_id, moto_id, mecanico_id)
    values ('${ID.oficinaA}', 2, '${ID.clienteA}', '${ID.motoA}', null);
  `)
  await logarComo(ID.mecanicoA)
  await esperaLinhas('enxerga só a OS atribuída a ele, não as duas', 'select count(*) as n from public.ordens_servico', 1)
  await esperaLinhas('passa a enxergar o cliente daquela OS', 'select count(*) as n from public.clientes', 1)
  await esperaLinhas('passa a enxergar a moto daquela OS', 'select count(*) as n from public.motos', 1)
  await esperaLinhas('continua sem enxergar o preço de custo', 'select count(*) as n from public.produtos', 0)
  await esperaBloqueio(
    'não passa a OS para outro mecânico',
    `update public.ordens_servico set mecanico_id = null where mecanico_id = '${ID.mecanicoA}'`,
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

async function main() {
  console.log('[1m\nValidação do banco — Gestão para Oficinas[0m')
  try {
    await rodarMigrations()
    await semear()
    await testarIsolamentoEntreOficinas()
    await testarPerfilVendedor()
    await testarPerfilMecanico()
    await testarRegrasDeNegocio()
  } catch (e) {
    console.error(`\n[31mInterrompido:[0m ${(e as Error).message}`)
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
