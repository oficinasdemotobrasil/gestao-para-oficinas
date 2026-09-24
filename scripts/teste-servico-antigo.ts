/**
 * Prova que o serviço antigo (0060) funciona no Supabase de verdade.
 *
 * O validar:banco já prova o SQL num Postgres local. Este prova que ele chegou
 * inteiro ao projeto de produção e que passa pelo PostgREST com usuário logado
 * e RLS ligado — o caminho exato que o celular do admin percorre.
 *
 * Monta uma oficina fictícia que "entrou no sistema" há 60 dias, lança um
 * serviço de 90 dias atrás e apaga tudo no fim.
 *
 *   npm run teste:servico-antigo
 *
 * Com MANTER=1, a oficina fica no banco para a conferência na tela, e o login
 * vai para o arquivo indicado em LOGIN_EM. Rode de novo sem MANTER para limpar.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { limparOficina, limparContasDeTeste } from './limpar-teste'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
config({ path: path.join(raiz, '.env.test.local'), quiet: true })
config({ path: path.join(raiz, '.env.local'), quiet: true })

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const MANTER = process.env.MANTER === '1'

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

/** aaaa-mm-dd de N dias atrás, no fuso de Brasília. */
function diasAtras(n: number): string {
  const d = new Date(Date.now() - n * 86400000)
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

async function limparTudo() {
  console.log('\n\x1b[1mLimpeza\x1b[0m')
  const { data: antigas } = await admin.from('oficinas').select('id').like('nome', '[antigo%')
  const problemas: string[] = []
  for (const o of antigas ?? []) problemas.push(...(await limparOficina(admin, o.id)))
  problemas.push(...(await limparContasDeTeste(admin, ['antigo.'])))

  const { data: sobrou } = await admin.from('oficinas').select('nome').like('nome', '[antigo%')
  if (problemas.length || (sobrou?.length ?? 0) > 0) {
    erro('a oficina de teste NÃO saiu do banco', problemas.join(' | ') || 'oficina ainda existe')
  } else {
    ok('oficina de teste removida')
  }
}

async function main() {
  console.log('\n\x1b[1mServiço antigo no Supabase de verdade\x1b[0m')
  console.log(`  ${URL}`)

  try {
    // Cenário -----------------------------------------------------------------
    const { data: of, error: eOf } = await admin
      .from('oficinas')
      .insert({ nome: `[antigo ${MARCA}] Oficina`, plano: 'completo' })
      .select()
      .single()
    if (eOf || !of) throw new Error(`oficina: ${eOf?.message ?? 'sem retorno'}`)

    // Entrou no sistema há 60 dias: é essa data que limita o serviço antigo.
    const { error: eData } = await admin
      .from('oficinas')
      .update({ criado_em: new Date(Date.now() - 60 * 86400000).toISOString() })
      .eq('id', of.id)
    if (eData) throw new Error(`data de entrada: ${eData.message}`)

    async function criar(nome: string, perfil: string) {
      const email = `antigo.${perfil}.${MARCA}@example.com`
      const { data: u, error } = await admin.auth.admin.createUser({
        email,
        password: SENHA,
        email_confirm: true,
      })
      if (error) throw new Error(`usuário ${perfil}: ${error.message}`)
      await admin.from('usuarios').insert({
        id: u.user!.id, oficina_id: of!.id, nome, email, perfil, ativo: true,
      })
      return email
    }
    const emailChefe = await criar('Tiago', 'admin')
    const emailVendedor = await criar('Bruna', 'vendedor')
    const emailMecanico = await criar('Jorge', 'mecanico')

    const app = createClient(URL!, ANON!, { auth: { persistSession: false } })
    const { error: eLogin } = await app.auth.signInWithPassword({ email: emailChefe, password: SENHA })
    if (eLogin) throw new Error(`login: ${eLogin.message}`)
    const appVendedor = createClient(URL!, ANON!, { auth: { persistSession: false } })
    await appVendedor.auth.signInWithPassword({ email: emailVendedor, password: SENHA })
    const appMecanico = createClient(URL!, ANON!, { auth: { persistSession: false } })
    await appMecanico.auth.signInWithPassword({ email: emailMecanico, password: SENHA })
    ok('oficina de teste que entrou no sistema há 60 dias, com admin e vendedor')

    const { data: cli } = await app
      .from('clientes').insert({ nome: 'Cliente do Caderno', telefone: '81988887777' }).select().single()
    const { data: motoCriada, error: eMoto } = await app.rpc('criar_moto_com_proprietario', {
      p_cliente_id: cli!.id, p_placa: `ANT${String(MARCA).slice(-4)}`,
      p_marca: 'Honda', p_modelo: 'CG 160', p_ano: 2020, p_cor: 'Preta',
      p_chassi: null, p_km_atual: 20000,
    })
    if (eMoto) throw new Error(`moto: ${eMoto.message}`)
    // A função devolve a moto inteira, não só o id.
    const motoId = (motoCriada as { id: string }).id
    const { data: peca } = await app
      .from('produtos')
      .insert({ nome: 'Óleo 10W30', unidade: 'un', preco_custo: 22, preco_venda: 45, estoque_atual: 5 })
      .select().single()

    const itens = [
      { tipo: 'avulso', produto_id: null, servico_id: null, descricao: 'Troca de óleo', quantidade: 1, valor_unitario: 60 },
      { tipo: 'produto', produto_id: peca!.id, servico_id: null, descricao: 'Óleo 10W30', quantidade: 2, valor_unitario: 45 },
    ]
    const dia = diasAtras(90)
    const pago = diasAtras(88)
    const lancar = (cliente: typeof app, dataServico: string, dataPagamento: string | null) =>
      cliente.rpc('lancar_servico_antigo', {
        p_cliente_id: cli!.id, p_moto_id: motoId, p_km_registrado: 15000,
        p_garantia_dias: 90, p_observacoes: 'Do caderno', p_desconto: 10,
        p_desconto_percentual: null, p_itens: itens,
        p_data_servico: dataServico, p_data_pagamento: dataPagamento, p_forma_pagamento: 'pix',
      })

    // O lançamento ------------------------------------------------------------
    const { data: orcId, error: eLanca } = await lancar(app, dia, pago)
    if (eLanca) throw new Error(`lançamento: ${eLanca.message}`)
    ok('o admin lança um serviço de 90 dias atrás', dia)

    const { data: orc } = await app.from('orcamentos').select('*').eq('id', orcId).single()
    orc!.status === 'aprovado' && orc!.historico_lancado_em && Number(orc!.valor_total) === 140
      ? ok('orçamento aprovado, marcado como histórico, R$ 140 com desconto')
      : erro('orçamento', JSON.stringify({ s: orc!.status, h: orc!.historico_lancado_em, v: orc!.valor_total }))
    const diaDoOrc = new Date(orc!.criado_em).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    diaDoOrc === dia ? ok('com a data do serviço', diaDoOrc) : erro('data do orçamento', diaDoOrc)

    const { data: os } = await app.from('ordens_servico').select('*').eq('orcamento_id', orcId).single()
    const diaDaOs = new Date(os!.data_abertura).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    os!.status === 'entregue' && diaDaOs === dia && Number(os!.valor_total) === 140
      ? ok('OS entregue, aberta na data do serviço, R$ 140', `nº ${os!.numero}`)
      : erro('OS', JSON.stringify({ s: os!.status, d: diaDaOs, v: os!.valor_total }))

    const { data: conta } = await app.from('contas_receber').select('*').eq('ordem_servico_id', os!.id)
    const c = conta?.[0]
    c && c.status === 'paga' && c.data_pagamento === pago && Number(c.valor_recebido) === 140 && c.forma_pagamento === 'pix'
      ? ok('recebimento pago na data informada, por Pix', pago)
      : erro('recebimento', JSON.stringify(conta))

    const { data: produto } = await app.from('produtos').select('estoque_atual').eq('id', peca!.id).single()
    Number(produto!.estoque_atual) === 5
      ? ok('o estoque não mexeu', '5 antes e depois')
      : erro('estoque', `veio ${produto!.estoque_atual}`)

    const { data: moto } = await app.from('motos').select('km_atual').eq('id', motoId).single()
    Number(moto!.km_atual) === 20000
      ? ok('o km antigo não puxou a moto para trás', '20.000')
      : erro('km da moto', String(moto!.km_atual))

    const { data: painel } = await app.rpc('painel', { p_de: dia, p_ate: dia })
    const s = (painel as { servicos: { finalizadas: number; valor_finalizado: number } }).servicos
    s.finalizadas === 1 && Number(s.valor_finalizado) === 140
      ? ok('o painel conta o serviço no dia em que aconteceu')
      : erro('painel', JSON.stringify(s))

    // O aviso da tela inicial (0061): serviço antigo é de antes de a oficina
    // entrar no sistema, então no painel do MÊS ele tem de aparecer como "fora
    // deste período". Foi essa ausência que pareceu dinheiro perdido.
    const agora = new Date()
    const mesDe = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-01`
    const mesAte = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).toLocaleDateString(
      'sv-SE',
      { timeZone: 'America/Sao_Paulo' },
    )
    const { data: painelDoMes, error: ePainel } = await app.rpc('painel', {
      p_de: mesDe,
      p_ate: mesAte,
    })
    const fora = (
      painelDoMes as { historico_fora_do_periodo?: { quantidade: number; valor: number } }
    )?.historico_fora_do_periodo
    if (ePainel) erro('painel do mês', ePainel.message)
    else if (fora && fora.quantidade === 1 && Number(fora.valor) === 140)
      ok('o painel do mês avisa do serviço antigo fora do período', `R$ ${fora.valor}`)
    else erro('aviso de histórico no painel', JSON.stringify(fora))

    // Serviço avulso guardado no catálogo -------------------------------------
    // Mesmas duas consultas de guardarServicoDoAvulso, na mesma ordem, contra o
    // banco de verdade: procura por nome e, só não achando, cadastra.
    const guardar = async (nome: string, preco: number) => {
      const semCuringa = nome.trim().replace(/([%_\\])/g, '\\$1')
      const { data: existente } = await app
        .from('servicos').select('id').ilike('nome', semCuringa).limit(1).maybeSingle()
      if (existente) return { id: existente.id as string, jaExistia: true }
      const { data: criado, error } = await app
        .from('servicos')
        .insert({ nome: nome.trim(), descricao: null, preco, tempo_estimado_minutos: null, ativo: true })
        .select().single()
      if (error) throw new Error(error.message)
      return { id: criado!.id as string, jaExistia: false }
    }

    const primeiro = await guardar('Solda no escapamento', 80)
    primeiro.jaExistia
      ? erro('avulso no catálogo', 'disse que já existia na primeira vez')
      : ok('o avulso vira serviço do catálogo')

    const repetido = await guardar('solda NO escapamento', 95)
    repetido.jaExistia && repetido.id === primeiro.id
      ? ok('e digitar de novo, em outra caixa, reaproveita o mesmo serviço')
      : erro('duplicou o serviço', JSON.stringify(repetido))

    const { data: precoMantido } = await app
      .from('servicos').select('preco').eq('id', primeiro.id).single()
    Number(precoMantido!.preco) === 80
      ? ok('o preço do catálogo não é sobrescrito pelo valor combinado num orçamento')
      : erro('preço do catálogo', String(precoMantido!.preco))

    // O nome com '%': sem escapar, ele casaria com o serviço errado.
    const comCuringa = await guardar('Revisão 100% completa', 300)
    comCuringa.jaExistia
      ? erro('nome com %', 'achou serviço que não existe — o curinga vazou')
      : ok('nome com "%" não casa com serviço de outro nome')

    const { count } = await app
      .from('servicos').select('id', { count: 'exact', head: true })
    count === 2
      ? ok('o catálogo ficou com dois serviços, não com quatro', String(count))
      : erro('quantidade no catálogo', String(count))

    // A busca do balcão (0062) -------------------------------------------------
    const buscar = async (termo: string) => {
      const { data, error } = await app.rpc('busca_geral', { p_termo: termo })
      if (error) throw new Error(`busca "${termo}": ${error.message}`)
      return data as {
        motos: Array<{ placa: string; dono_nome: string | null; servicos_abertos: number }>
        clientes: Array<{ nome: string; em_aberto: number; motos: unknown[] }>
        ordens: Array<{ numero: number }>
      }
    }

    const placa = `ANT${String(MARCA).slice(-4)}`
    const porPlaca = await buscar(placa.toLowerCase())
    porPlaca.motos[0]?.placa === placa && porPlaca.motos[0]?.dono_nome === 'Cliente do Caderno'
      ? ok('a busca acha a moto pela placa e já traz o dono')
      : erro('busca por placa', JSON.stringify(porPlaca.motos))

    const porNome = await buscar('caderno')
    porNome.clientes[0]?.motos.length === 1
      ? ok('acha o cliente pelo nome, com a moto dele junto')
      : erro('busca por nome', JSON.stringify(porNome.clientes))

    const porTelefone = await buscar('98888')
    porTelefone.clientes.length === 1
      ? ok('acha pelo pedaço do telefone')
      : erro('busca por telefone', JSON.stringify(porTelefone.clientes))

    const porNumero = await buscar(String(os!.numero))
    porNumero.ordens.some((o) => o.numero === os!.numero)
      ? ok('e acha a OS pelo número', `OS ${os!.numero}`)
      : erro('busca por número da OS', JSON.stringify(porNumero.ordens))

    const nada = await buscar('zzzz9999')
    nada.motos.length === 0 && nada.clientes.length === 0 && nada.ordens.length === 0
      ? ok('e não inventa resultado quando não existe')
      : erro('busca sem resultado', JSON.stringify(nada))

    // A ficha completa (0064) ---------------------------------------------------
    const { data: fichaCliente, error: eFicha } = await app.rpc('ficha_do_cliente', {
      p_cliente: cli!.id,
    })
    const fc = fichaCliente as {
      resumo: { servicos: number; total_gasto: number }
      ordens: { total: number }
      financeiro: { em_aberto: number; recebido: number } | null
    } | null
    if (eFicha) erro('ficha do cliente', eFicha.message)
    else if (fc && Number(fc.resumo.total_gasto) === 140 && Number(fc.ordens.total) >= 1)
      ok('a ficha do cliente cruza serviço, valor e ordens', `R$ ${fc.resumo.total_gasto}`)
    else erro('ficha do cliente', JSON.stringify(fc))
    fc?.financeiro && Number(fc.financeiro.recebido) === 140
      ? ok('e traz o dinheiro junto', `R$ ${fc.financeiro.recebido} recebido`)
      : erro('financeiro na ficha', JSON.stringify(fc?.financeiro))

    const { data: fichaMoto, error: eMotoFicha } = await app.rpc('ficha_da_moto', {
      p_moto: motoId,
    })
    const fm = fichaMoto as {
      resumo: { servicos: number; garantia_ate: string | null }
      pecas: Array<{ descricao: string }>
    } | null
    if (eMotoFicha) erro('ficha da moto', eMotoFicha.message)
    else if (fm && fm.pecas.some((x) => x.descricao === 'Óleo 10W30'))
      ok('a ficha da moto lista a peça trocada nela')
    else erro('peças na ficha da moto', JSON.stringify(fm?.pecas))

    // O vendedor entra e vê o que o cliente deve; o mecânico não entra.
    const doVendedor = await appVendedor.rpc('ficha_do_cliente', { p_cliente: cli!.id })
    doVendedor.error === null && (doVendedor.data as { financeiro: unknown }).financeiro !== null
      ? ok('o vendedor abre a ficha e vê o financeiro daquele cliente')
      : erro('ficha para o vendedor', JSON.stringify(doVendedor.error ?? doVendedor.data))

    const { error: eVendedorTabela } = await appVendedor
      .from('contas_receber').select('id').limit(1)
    const { data: tabelaVendedor } = await appVendedor
      .from('contas_receber').select('id').limit(1)
    !eVendedorTabela && (tabelaVendedor ?? []).length === 0
      ? ok('mas continua sem enxergar a tabela de contas por fora da ficha')
      : erro('vendedor leu contas_receber', JSON.stringify(tabelaVendedor ?? eVendedorTabela))

    const doMecanico = await appMecanico.rpc('ficha_do_cliente', { p_cliente: cli!.id })
    doMecanico.error
      ? ok('o mecânico não abre a ficha', doMecanico.error.message)
      : erro('mecânico abriu a ficha', JSON.stringify(doMecanico.data))

    // Indicador e comissão (0065) ----------------------------------------------
    const { data: indicador, error: eInd } = await app
      .from('indicadores')
      .insert({ nome: 'João da Esquina', telefone: '(81) 91234-5678', codigo: `joao ${String(MARCA).slice(-4)}` })
      .select()
      .single()
    if (eInd) throw new Error(`indicador: ${eInd.message}`)
    indicador!.codigo === `JOAO${String(MARCA).slice(-4)}`
      ? ok('o código do indicador vira caixa alta e sem espaço', indicador!.codigo)
      : erro('código do indicador', indicador!.codigo)

    const { data: achado } = await app.rpc('indicador_por_codigo', {
      p_codigo: indicador!.codigo.toLowerCase(),
    })
    const achadoPeloCodigo = (achado as Array<{ nome: string; percentual: number }>)?.[0]
    achadoPeloCodigo?.nome === 'João da Esquina' && Number(achadoPeloCodigo.percentual) === 10
      ? ok('o código digitado em minúscula acha o indicador, com o percentual da oficina')
      : erro('busca por código', JSON.stringify(achado))

    const itensComIndicacao = [
      { tipo: 'avulso', produto_id: null, servico_id: null, descricao: 'Revisão completa', quantidade: 1, valor_unitario: 1000 },
    ]
    const { data: orcIndicado, error: eOrc } = await app.rpc('salvar_orcamento_com_itens', {
      p_orcamento_id: null, p_cliente_id: cli!.id, p_moto_id: motoId, p_km_registrado: null,
      p_validade_dias: 7, p_garantia_dias: 90, p_observacoes: null,
      p_desconto: 0, p_desconto_percentual: null, p_itens: itensComIndicacao,
      p_indicador_id: indicador!.id,
    })
    if (eOrc) throw new Error(`orçamento com indicador: ${eOrc.message}`)

    const { data: osIndicada, error: eAprov } = await app.rpc('aprovar_orcamento', {
      p_orcamento_id: orcIndicado as string,
      p_responsavel_id: null,
    })
    if (eAprov) throw new Error(`aprovação: ${eAprov.message}`)

    const { data: comissao } = await app
      .from('comissoes').select('*').eq('orcamento_id', orcIndicado as string).single()
    comissao && Number(comissao.valor) === 100 && comissao.status === 'a_pagar'
      ? ok('aprovar o orçamento gera a comissão', `10% de R$ 1.000 = R$ ${comissao.valor}`)
      : erro('comissão na aprovação', JSON.stringify(comissao))

    // O contrapeso: cancelar a ordem cancela a comissão.
    await app.rpc('cancelar_os', { p_ordem_servico_id: osIndicada as string, p_motivo: 'teste' })
    const { data: comissaoDepois } = await app
      .from('comissoes').select('status').eq('orcamento_id', orcIndicado as string).single()
    comissaoDepois?.status === 'cancelada'
      ? ok('e cancelar a ordem cancela a comissão junto')
      : erro('comissão após cancelar a OS', JSON.stringify(comissaoDepois))

    const { data: resumoInd } = await app.rpc('indicadores_com_comissoes')
    const r = resumoInd as { percentual_padrao: number; indicadores: Array<{ nome: string; indicacoes: number }> }
    r?.indicadores?.[0]?.nome === 'João da Esquina' && Number(r.percentual_padrao) === 10
      ? ok('o resumo de indicadores responde para o admin')
      : erro('resumo de indicadores', JSON.stringify(r))

    // O vendedor lê o indicador (monta o orçamento), mas não vê comissão.
    const { data: indDoVendedor } = await appVendedor.from('indicadores').select('id')
    ;(indDoVendedor ?? []).length === 1
      ? ok('o vendedor lê os indicadores')
      : erro('vendedor sem indicadores', JSON.stringify(indDoVendedor))
    const { data: comDoVendedor } = await appVendedor.from('comissoes').select('id')
    ;(comDoVendedor ?? []).length === 0
      ? ok('mas não vê comissão nenhuma')
      : erro('vendedor viu comissão', JSON.stringify(comDoVendedor))

    // As travas ---------------------------------------------------------------
    const depois = await lancar(app, diasAtras(10), null)
    depois.error
      ? ok('recusa data depois da entrada no sistema', depois.error.message)
      : erro('data depois da entrada', 'foi aceita')

    const vendedor = await lancar(appVendedor, dia, null)
    vendedor.error
      ? ok('o vendedor não lança', vendedor.error.message)
      : erro('vendedor', 'conseguiu lançar')

    if (MANTER) {
      // Fora do repositório: é uma senha, mesmo que de uma conta descartável.
      const arquivo = process.env.LOGIN_EM ?? path.join(tmpdir(), 'login-teste-giro.txt')
      await writeFile(arquivo, `${emailChefe}\n${SENHA}\n`, { mode: 0o600 })
      console.log(`\n  Oficina mantida para conferência na tela. Login em ${arquivo}`)
    }
  } catch (e) {
    erro('execução interrompida', (e as Error).message)
  } finally {
    if (!MANTER) await limparTudo()
  }

  console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
  if (falhas.length) {
    console.log('\nFalhas:')
    falhas.forEach((f) => console.log(`  - ${f}`))
  }
  process.exit(falhou === 0 ? 0 : 1)
}

void main()
