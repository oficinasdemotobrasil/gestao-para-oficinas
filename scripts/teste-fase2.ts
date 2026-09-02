/**
 * Prova que as regras da Fase 2 funcionam no Supabase de verdade.
 *
 * O validar:banco roda as migrations num Postgres local e prova que o SQL está
 * certo. Este aqui prova outra coisa: que o SQL certo chegou inteiro ao projeto
 * de produção, passando pelo PostgREST, com um usuário de verdade e o RLS
 * ligado. Uma migration pode estar impecável no arquivo e ter sido aplicada pela
 * metade no painel.
 *
 * Monta uma oficina fictícia, exercita estoque, nota, orçamento e aprovação, e
 * apaga tudo no fim. Precisa de .env.test.local.
 *
 *   npm run teste:fase2
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

const ok = (nome: string, detalhe = '') => {
  passou++
  console.log(`  \x1b[32m✓\x1b[0m ${nome}${detalhe ? ` (${detalhe})` : ''}`)
}
const erro = (nome: string, detalhe: string) => {
  falhou++
  falhas.push(`${nome} — ${detalhe}`)
  console.log(`  \x1b[31m✗\x1b[0m ${nome}\n      ${detalhe}`)
}

async function saldo(app: SupabaseClient, produtoId: string): Promise<number> {
  const { data } = await app.from('produtos').select('estoque_atual').eq('id', produtoId).single()
  return Number(data?.estoque_atual ?? -1)
}

const oficinas: string[] = []

async function main() {
  console.log('\n\x1b[1mFase 2 no Supabase de verdade\x1b[0m')
  console.log(`  ${URL}`)

  try {
    // Cenário -----------------------------------------------------------------
    const { data: of, error: eOf } = await admin
      .from('oficinas').insert({ nome: `[fase2 ${MARCA}] Oficina` }).select().single()
    if (eOf || !of) throw new Error(`oficina: ${eOf?.message ?? 'sem retorno'}`)
    oficinas.push(of.id)

    const email = `fase2.${MARCA}@example.com`
    const { data: u } = await admin.auth.admin.createUser({
      email, password: SENHA, email_confirm: true,
    })
    await admin.from('usuarios').insert({
      id: u.user!.id, oficina_id: of.id, nome: 'Admin Fase 2',
      email, perfil: 'admin', ativo: true,
    })

    const app = createClient(URL!, ANON!, { auth: { persistSession: false } })
    const { error: eLogin } = await app.auth.signInWithPassword({ email, password: SENHA })
    if (eLogin) throw new Error(`login falhou: ${eLogin.message}`)
    ok('oficina de teste com admin')

    const { data: cliente, error: eCli } = await app.from('clientes')
      .insert({ nome: 'Cliente Fase 2', telefone: '11988887777' }).select().single()
    if (eCli || !cliente) throw new Error(`cliente: ${eCli?.message ?? 'sem retorno'}`)
    const { data: moto, error: eMoto } = await app.from('motos')
      // Placa no padrão Mercosul: 3 letras, dígito, letra, 2 dígitos.
      .insert({ placa: `TST1A${String(MARCA).slice(-2)}`, marca: 'Honda', modelo: 'CG 160', km_atual: 10000 })
      .select().single()
    if (eMoto || !moto) throw new Error(`moto: ${eMoto?.message ?? 'sem retorno'}`)

    // Estoque -----------------------------------------------------------------
    console.log('\n\x1b[1mEstoque\x1b[0m')
    const { data: produto, error: eProd } = await app.from('produtos')
      .insert({
        nome: 'Óleo 10W30', unidade: 'L', preco_custo: 22, preco_venda: 45,
        estoque_atual: 8, estoque_minimo: 3, ativo: true,
      }).select().single()
    if (eProd || !produto) throw new Error(`produto: ${eProd?.message ?? 'sem retorno'}`)

    const saldoInicial = await saldo(app, produto.id)
    const { data: movInicial } = await app.from('vw_movimentacoes')
      .select('tipo, quantidade, motivo').eq('produto_id', produto.id)
    saldoInicial === 8 && movInicial?.length === 1 && movInicial[0].motivo === 'Saldo inicial do cadastro'
      ? ok('produto cadastrado com 8 gera a movimentação de saldo inicial')
      : erro('saldo inicial', `saldo ${saldoInicial}, movimentações ${movInicial?.length}`)

    await app.rpc('registrar_movimentacao', {
      p_produto_id: produto.id, p_tipo: 'entrada', p_quantidade: 10, p_motivo: 'Compra',
    })
    const aposEntrada = await saldo(app, produto.id)
    aposEntrada === 18 ? ok(`entrada de 10 (8 → ${aposEntrada})`) : erro('entrada', `veio ${aposEntrada}`)

    await app.rpc('registrar_movimentacao', {
      p_produto_id: produto.id, p_tipo: 'saida', p_quantidade: 4, p_motivo: 'Serviço',
    })
    const aposSaida = await saldo(app, produto.id)
    aposSaida === 14 ? ok(`saída de 4 (18 → ${aposSaida})`) : erro('saída', `veio ${aposSaida}`)

    const { error: eNeg } = await app.rpc('registrar_movimentacao', {
      p_produto_id: produto.id, p_tipo: 'saida', p_quantidade: 999, p_motivo: 'Absurdo',
    })
    eNeg && eNeg.message.includes('Não há estoque suficiente')
      ? ok('saída maior que o saldo é recusada', eNeg.message.slice(0, 60))
      : erro('bloqueio de negativo', eNeg ? eNeg.message : 'a saída passou')

    const { error: eDireto } = await app.from('produtos')
      .update({ estoque_atual: 999 }).eq('id', produto.id)
    eDireto && eDireto.message.includes('não é alterado direto')
      ? ok('escrever no saldo direto é recusado')
      : erro('proteção do saldo', eDireto ? eDireto.message : 'a escrita passou')

    // Nota fiscal -------------------------------------------------------------
    console.log('\n\x1b[1mNota fiscal\x1b[0m')
    const { data: notaId, error: eNota } = await app.rpc('salvar_nota_com_itens', {
      p_numero: '5566', p_fornecedor: 'Distribuidora', p_data_emissao: new Date().toISOString().slice(0, 10),
      p_valor_total: 240, p_arquivo_url: null,
      p_itens: [{ produto_id: produto.id, quantidade: 12, custo_unitario: 20 }],
    })
    if (eNota) throw new Error(`nota: ${eNota.message}`)
    const aposNota = await saldo(app, produto.id)
    aposNota === 26 ? ok(`os 12 itens da nota entram no estoque (14 → ${aposNota})`) : erro('nota', `veio ${aposNota}`)

    await app.rpc('cancelar_nota', { p_nota_id: notaId })
    const aposCancelar = await saldo(app, produto.id)
    aposCancelar === 14 ? ok(`cancelar devolve o estoque (${aposCancelar})`) : erro('estorno', `veio ${aposCancelar}`)

    // Orçamento ---------------------------------------------------------------
    console.log('\n\x1b[1mOrçamento\x1b[0m')
    const { data: servico, error: eServ } = await app.from('servicos')
      .insert({ nome: 'Troca de óleo', preco: 60, tempo_estimado_minutos: 30, ativo: true })
      .select().single()
    if (eServ || !servico) throw new Error(`serviço: ${eServ?.message ?? 'sem retorno'}`)

    const itens = [
      { tipo: 'produto', produto_id: produto.id, servico_id: null, descricao: 'Óleo 10W30', quantidade: 2, valor_unitario: 45 },
      { tipo: 'servico', produto_id: null, servico_id: servico.id, descricao: 'Troca de óleo', quantidade: 1, valor_unitario: 60 },
      { tipo: 'avulso', produto_id: null, servico_id: null, descricao: 'Solda no escapamento', quantidade: 1, valor_unitario: 40 },
    ]

    const { data: orcId, error: eOrc } = await app.rpc('salvar_orcamento_com_itens', {
      p_orcamento_id: null, p_cliente_id: cliente.id, p_moto_id: moto.id,
      p_km_registrado: 24500, p_validade_dias: 7, p_garantia_dias: 90,
      p_observacoes: 'Cliente pediu urgência', p_desconto: 20, p_desconto_percentual: null,
      p_itens: itens,
    })
    if (eOrc) throw new Error(`orçamento: ${eOrc.message}`)

    const { data: orc, error: eLer } = await app.from('orcamentos')
      .select('numero, valor_total, validade_ate, status').eq('id', orcId).single()
    if (eLer || !orc) throw new Error(`ler orçamento: ${eLer?.message ?? 'sem retorno'}`)
    Number(orc.valor_total) === 170
      ? ok('total calculado no banco: 190 − 20 de desconto = 170')
      : erro('total', `veio ${orc.valor_total}`)
    orc.numero === 1 ? ok('numeração começa no 1 nesta oficina') : erro('numeração', `veio ${orc.numero}`)
    orc.validade_ate ? ok(`validade gravada como data (${orc.validade_ate})`) : erro('validade', 'veio nula')

    const { data: kmMoto } = await app.from('motos').select('km_atual').eq('id', moto.id).single()
    Number(kmMoto?.km_atual) === 24500 ? ok('a moto ficou com o km do orçamento') : erro('km', `veio ${kmMoto?.km_atual}`)

    const { count: qtdItens } = await app.from('orcamento_itens')
      .select('*', { count: 'exact', head: true }).eq('orcamento_id', orcId)
    qtdItens === 3 ? ok('os três itens gravados, inclusive o avulso') : erro('itens', `veio ${qtdItens}`)

    // Aprovação ---------------------------------------------------------------
    console.log('\n\x1b[1mAprovação\x1b[0m')
    const estoqueAntes = await saldo(app, produto.id)
    const { data: osId, error: eAprov } = await app.rpc('aprovar_orcamento', {
      p_orcamento_id: orcId, p_responsavel_id: u.user!.id,
    })
    if (eAprov) throw new Error(`aprovação: ${eAprov.message}`)

    const { data: os, error: eOs } = await app.from('ordens_servico')
      .select('numero, status, responsavel_id, garantia_ate, km_entrada').eq('id', osId).single()
    if (eOs || !os) throw new Error(`ler OS: ${eOs?.message ?? 'sem retorno'}`)
    os.status === 'aberta' && os.responsavel_id === u.user!.id
      ? ok(`OS ${os.numero} aberta e direcionada ao responsável`)
      : erro('OS', JSON.stringify(os))

    const { count: itensOs } = await app.from('os_itens')
      .select('*', { count: 'exact', head: true }).eq('ordem_servico_id', osId)
    itensOs === 3 ? ok('os três itens copiados para a OS') : erro('itens da OS', `veio ${itensOs}`)

    const estoqueDepois = await saldo(app, produto.id)
    estoqueDepois === estoqueAntes
      ? ok(`aprovar NÃO mexeu no estoque (${estoqueAntes} antes e depois)`)
      : erro('estoque na aprovação', `${estoqueAntes} → ${estoqueDepois}`)

    const { error: eEdit } = await app.rpc('salvar_orcamento_com_itens', {
      p_orcamento_id: orcId, p_cliente_id: cliente.id, p_moto_id: moto.id,
      p_km_registrado: 24500, p_validade_dias: 7, p_garantia_dias: 90,
      p_observacoes: 'tentando mudar', p_desconto: 0, p_desconto_percentual: null, p_itens: [],
    })
    eEdit ? ok('orçamento aprovado não pode mais ser editado') : erro('trava do aprovado', 'a edição passou')

    await app.auth.signOut()
  } catch (e) {
    erro('execução do teste', (e as Error).message)
  } finally {
    console.log('\n\x1b[1mLimpeza\x1b[0m')
    const problemas: string[] = []
    for (const id of oficinas) problemas.push(...(await limparOficina(admin, id)))
    problemas.push(...(await limparContasDeTeste(admin, ['fase2.'])))

    // Limpeza que falha em silêncio deixa oficina de teste no banco do cliente.
    // Já aconteceu: três ficaram para trás porque o extrato de estoque precisa
    // ser desfeito do mais novo para o mais antigo, e o delete em bloco não faz
    // isso. Agora a falha aparece como falha.
    problemas.length === 0
      ? ok('oficina de teste removida')
      : erro('limpeza', `sobrou dado de teste no banco: ${problemas.join('; ')}`)
  }

  console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
  if (falhas.length) {
    console.log('\nFalhas:')
    falhas.forEach((f) => console.log(`  - ${f}`))
  }
  process.exit(falhou === 0 ? 0 : 1)
}

void main()
