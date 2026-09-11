/**
 * A lista de estornos, contra um Postgres de verdade.
 *
 * O que este teste existe para pegar: a lista tem que enxergar as DUAS formas
 * de evento que estão no banco de produção. O webhook guarda o envelope, com a
 * cobrança dentro de `payment`; o `reprocessar` guardou a cobrança crua, no
 * primeiro nível. Uma consulta que só conhece a primeira forma esconde
 * justamente as cobranças antigas — que são as que mais precisam de estorno.
 *
 *   npm run teste:estornos
 */
import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const db = new PGlite()

let passou = 0
let falhou = 0
const ok = (n: string, d = '') => { passou++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? ` (${d})` : ''}`) }
const erro = (n: string, d: string) => { falhou++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`) }

function confere(nome: string, achado: unknown, esperado: unknown) {
  if (JSON.stringify(achado) === JSON.stringify(esperado)) ok(nome, String(achado))
  else erro(nome, `esperava ${JSON.stringify(esperado)}, veio ${JSON.stringify(achado)}`)
}

async function migrar() {
  const shim = await readFile(path.join(raiz, 'scripts/shim-supabase.sql'), 'utf8')
  await db.exec(shim)
  const dir = path.join(raiz, 'supabase/migrations')
  for (const a of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    const bruto = await readFile(path.join(dir, a), 'utf8')
    await db.exec(bruto.replace(/create extension[^;]+;/gi, ''))
  }
}

/** Uma cobrança como o provedor manda, com o que a nossa consulta lê. */
const cobranca = (x: {
  id: string
  valor?: number
  status?: string
  assinatura?: string
  refunds?: unknown[] | null
  pago_em?: string
}) => ({
  id: x.id,
  object: 'payment',
  value: x.valor ?? 29.99,
  status: x.status ?? 'RECEIVED',
  refunds: x.refunds ?? null,
  billingType: 'PIX',
  subscription: x.assinatura ?? null,
  paymentDate: x.pago_em ?? '2026-03-01',
  invoiceUrl: `https://www.asaas.com/i/${x.id.replace('pay_', '')}`,
})

async function semear() {
  await db.exec(`
    insert into public.oficinas (id, nome, telefone, plano) values
      ('11111111-1111-1111-1111-111111111111', 'Oficina que Arrependeu', '(11) 90000-0001', 'essencial'),
      ('22222222-2222-2222-2222-222222222222', 'Oficina que Ficou',      '(11) 90000-0002', 'essencial');

    insert into public.assinaturas
      (oficina_id, plano, situacao, inicio, id_externo_assinatura, cancelada_em)
    values
      -- Pagou dia 1, cancelou dia 4: dentro dos sete dias.
      ('11111111-1111-1111-1111-111111111111', 'essencial', 'encerrada', '2026-03-01',
       'sub_arrependeu', '2026-03-04T10:00:00Z'),
      -- Pagou dia 1, cancelou 90 dias depois: fora do prazo.
      ('11111111-1111-1111-1111-111111111111', 'essencial', 'encerrada', '2026-03-01',
       'sub_tarde', '2026-05-30T10:00:00Z'),
      -- Nunca cancelou.
      ('22222222-2222-2222-2222-222222222222', 'essencial', 'ativa', '2026-03-01',
       'sub_ativa', null);
  `)

  let n = 0
  const evento = async (tipo: string, oficina: string, conteudo: unknown) => {
    await db.query(
      `insert into public.eventos_asaas (evento_id, tipo, oficina_id, conteudo)
       values ($1, $2, $3, $4)`,
      [`evt_${++n}`, tipo, oficina, JSON.stringify(conteudo)],
    )
  }
  const A = '11111111-1111-1111-1111-111111111111'
  const B = '22222222-2222-2222-2222-222222222222'

  // Forma 1: o envelope do webhook, com a cobrança dentro de `payment`.
  await evento('PAYMENT_RECEIVED', A, {
    event: 'PAYMENT_RECEIVED',
    payment: cobranca({ id: 'pay_arrependeu', assinatura: 'sub_arrependeu' }),
  })

  // Forma 2: a cobrança crua, como o `reprocessar` guardou antes do webhook.
  await evento('REPROCESSADO_PELA_PLATAFORMA', A,
    cobranca({ id: 'pay_tarde', assinatura: 'sub_tarde' }))

  // Assinatura viva: pagou e não pediu nada.
  await evento('PAYMENT_RECEIVED', B, {
    event: 'PAYMENT_RECEIVED',
    payment: cobranca({ id: 'pay_ativa', assinatura: 'sub_ativa' }),
  })

  // A mesma cobrança avisada três vezes. Não pode virar três linhas.
  await evento('PAYMENT_CREATED', B, {
    event: 'PAYMENT_CREATED',
    payment: cobranca({ id: 'pay_ativa', status: 'PENDING', assinatura: 'sub_ativa' }),
  })
  await evento('PAYMENT_CONFIRMED', B, {
    event: 'PAYMENT_CONFIRMED',
    payment: cobranca({ id: 'pay_ativa', status: 'CONFIRMED', assinatura: 'sub_ativa' }),
  })
}

type Linha = {
  cobranca_id: string
  oficina: string
  valor: number
  situacao: string
  motivo: string
  tem_direito: boolean
  endereco_no_provedor: string
}

const listar = async (): Promise<Linha[]> => {
  const r = await db.query<{ plataforma_estornos: Linha[] }>('select public.plataforma_estornos()')
  return r.rows[0].plataforma_estornos
}
const acha = (l: Linha[], id: string) => l.find((x) => x.cobranca_id === id)

async function main() {
  await migrar()
  await semear()

  console.log('\n\x1b[1mAs duas formas de evento\x1b[0m')
  let lista = await listar()
  confere('cada cobrança aparece uma vez só', lista.length, 3)
  ok('a cobrança do webhook aparece', acha(lista, 'pay_arrependeu') ? 'sim' : 'NÃO')
  if (!acha(lista, 'pay_tarde')) {
    erro('a cobrança reprocessada aparece', 'sumiu: a consulta só enxerga o formato do webhook')
  } else {
    ok('a cobrança reprocessada aparece', 'formato cru, no primeiro nível')
  }

  console.log('\n\x1b[1mQuem tem direito ao arrependimento\x1b[0m')
  confere('cancelou em 3 dias: pendente', acha(lista, 'pay_arrependeu')?.situacao, 'pendente')
  confere('cancelou em 3 dias: tem direito', acha(lista, 'pay_arrependeu')?.tem_direito, true)
  confere('cancelou 90 dias depois: pendente', acha(lista, 'pay_tarde')?.situacao, 'pendente')
  confere('cancelou 90 dias depois: sem direito', acha(lista, 'pay_tarde')?.tem_direito, false)
  confere('assinatura viva: nada a devolver', acha(lista, 'pay_ativa')?.situacao, 'sem_pedido')

  console.log('\n\x1b[1mA ordem: o urgente primeiro\x1b[0m')
  confere('o arrependimento vem na frente', lista[0].cobranca_id, 'pay_arrependeu')

  console.log('\n\x1b[1mO endereço da cobrança no provedor\x1b[0m')
  confere('veio do próprio provedor', acha(lista, 'pay_arrependeu')?.endereco_no_provedor,
    'https://www.asaas.com/i/arrependeu')

  console.log('\n\x1b[1mMarcar à mão\x1b[0m')
  await db.query(
    `select public.plataforma_marcar_estorno($1, $2, $3, 'feito', 'devolvi pelo painel do Asaas', 'ed@teste')`,
    ['pay_arrependeu', '11111111-1111-1111-1111-111111111111', 29.99],
  )
  lista = await listar()
  confere('marcado como feito sai de pendente', acha(lista, 'pay_arrependeu')?.situacao, 'devolvido')
  const m = acha(lista, 'pay_arrependeu')?.motivo ?? ''
  if (m.includes('ed@teste')) ok('o motivo diz quem marcou', m)
  else erro('o motivo diz quem marcou', `veio "${m}"`)

  // Marcar duas vezes é a mesma coisa que marcar uma. Quem administra vai
  // clicar duas vezes com a mão suja de graxa.
  await db.query(
    `select public.plataforma_marcar_estorno($1, $2, $3, 'dispensado', 'era teste nosso', 'ed@teste')`,
    ['pay_arrependeu', '11111111-1111-1111-1111-111111111111', 29.99],
  )
  lista = await listar()
  confere('marcar de novo troca, não duplica', lista.length, 3)
  confere('virou dispensado', acha(lista, 'pay_arrependeu')?.situacao, 'dispensado')

  await db.query('select public.plataforma_desmarcar_estorno($1)', ['pay_arrependeu'])
  lista = await listar()
  confere('desmarcar devolve para pendente', acha(lista, 'pay_arrependeu')?.situacao, 'pendente')

  console.log('\n\x1b[1mO provedor ganha da marca\x1b[0m')
  // Mesmo dispensado por nós, se o provedor devolveu, devolvido está.
  await db.query(
    `select public.plataforma_marcar_estorno($1, $2, $3, 'dispensado', 'não vou devolver', 'ed@teste')`,
    ['pay_tarde', '11111111-1111-1111-1111-111111111111', 29.99],
  )
  await db.query(
    `insert into public.eventos_asaas (evento_id, tipo, oficina_id, conteudo)
     values ('evt_refund', 'PAYMENT_REFUNDED', $1, $2)`,
    ['11111111-1111-1111-1111-111111111111',
     JSON.stringify({ event: 'PAYMENT_REFUNDED', payment: cobranca({ id: 'pay_tarde', status: 'REFUNDED' }) })],
  )
  lista = await listar()
  confere('evento de estorno ganha da marca', acha(lista, 'pay_tarde')?.situacao, 'devolvido')

  console.log('\n\x1b[1mO estorno escondido dentro da cobrança\x1b[0m')
  // Quando o evento PAYMENT_REFUNDED se perde, a própria cobrança conta.
  await db.query(
    `insert into public.eventos_asaas (evento_id, tipo, oficina_id, conteudo)
     values ('evt_update', 'PAYMENT_UPDATED', $1, $2)`,
    ['22222222-2222-2222-2222-222222222222',
     JSON.stringify({
       event: 'PAYMENT_UPDATED',
       payment: cobranca({
         id: 'pay_ativa', assinatura: 'sub_ativa',
         refunds: [{ status: 'DONE', value: 29.99 }],
       }),
     })],
  )
  lista = await listar()
  confere('a lista lê o campo refunds', acha(lista, 'pay_ativa')?.situacao, 'devolvido')

  console.log('\n\x1b[1mA tranca\x1b[0m')
  for (const f of ['plataforma_estornos()', 'plataforma_desmarcar_estorno(text)']) {
    const r = await db.query<{ tem: boolean }>(
      `select has_function_privilege('authenticated', $1, 'execute') as tem`, [`public.${f}`])
    if (r.rows[0].tem) erro(`${f} está aberta para quem loga`, 'revoke faltando')
    else ok(`${f} fechada para quem loga`)
  }

  console.log(
    `\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`,
  )
  process.exit(falhou > 0 ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
