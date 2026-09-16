import { supabase } from '@/lib/supabase'
import { limparBusca } from '@/lib/erros'
import type {
  Cliente,
  ContaPagar,
  ContaReceber,
  FormaPagamento,
  ItemNfSaidaPayload,
  NotaFiscalEntrada,
  NotaFiscalSaida,
  StatusNota,
} from '@/tipos/banco'
import { validarCamposFiscais, validarItens, type CamposFiscais } from './validacaoFiscal'

// Entrada ----------------------------------------------------------------------

export interface NotaEntradaNaLista extends NotaFiscalEntrada {
  parcelas: Pick<ContaPagar, 'id' | 'status' | 'vencimento'>[]
}

export async function listarNotasEntrada(opcoes: {
  busca: string
  status: StatusNota | 'todas'
}): Promise<NotaEntradaNaLista[]> {
  let consulta = supabase
    .from('notas_fiscais_entrada')
    .select('*, parcelas:contas_pagar(id, status, vencimento)')
    .order('data_emissao', { ascending: false })
    .limit(200)

  if (opcoes.status !== 'todas') consulta = consulta.eq('status', opcoes.status)
  const termo = limparBusca(opcoes.busca)
  if (termo) consulta = consulta.or(`numero.ilike.%${termo}%,fornecedor.ilike.%${termo}%`)

  const { data, error } = await consulta
  if (error) throw error
  return (data ?? []) as unknown as NotaEntradaNaLista[]
}

/** Um item enquanto está sendo montado na tela, antes de virar movimentação. */
export interface ItemEntradaEmEdicao {
  /** Identidade só na tela. */
  chave: string
  produto_id: string
  produto_nome?: string
  quantidade: number
  custo_unitario: number | null
}

export interface DadosNotaEntrada extends CamposFiscais {
  numero: string
  fornecedor: string | null
  data_emissao: string
  valor_total: number
  arquivo_url: string | null
  /** Os 44 dígitos, quando a nota veio digitada, colada ou lida por QR code. */
  chave_acesso: string | null
  itens: ItemEntradaEmEdicao[]
  parcelas: number
  primeiro_vencimento: string | null
  categoria: string | null
  forma_pagamento: FormaPagamento | null
  pago_agora: boolean
}

/**
 * Lança a nota de entrada, com os itens (que viram movimentação de estoque) e
 * o financeiro (que vira Contas a Pagar), tudo numa transação só, pela função
 * do banco. Validar aqui evita mandar pra rede o que já se sabe que vai
 * voltar com erro.
 */
export async function salvarNotaEntrada(dados: DadosNotaEntrada): Promise<string> {
  validarCamposFiscais(dados)
  validarItens(dados.itens)

  const { data, error } = await supabase.rpc('salvar_nota_com_itens', {
    p_numero: dados.numero,
    p_fornecedor: dados.fornecedor,
    p_data_emissao: dados.data_emissao,
    p_valor_total: dados.valor_total,
    p_arquivo_url: dados.arquivo_url,
    p_itens: dados.itens.map((i) => ({
      produto_id: i.produto_id,
      quantidade: i.quantidade,
      custo_unitario: i.custo_unitario,
    })),
    p_natureza_operacao: dados.natureza_operacao ?? null,
    p_cfop: dados.cfop ?? null,
    p_base_calculo_icms: dados.base_calculo_icms ?? null,
    p_valor_icms: dados.valor_icms ?? null,
    p_valor_iss: dados.valor_iss ?? null,
    p_chave_acesso: dados.chave_acesso,
    p_parcelas: dados.parcelas,
    p_primeiro_vencimento: dados.primeiro_vencimento,
    p_categoria: dados.categoria,
    p_forma_pagamento: dados.forma_pagamento,
    p_pago_agora: dados.pago_agora,
  })
  if (error) throw error
  return data as string
}

export async function cancelarNotaEntrada(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancelar_nota', { p_nota_id: id })
  if (error) throw error
}

export interface NotaEntradaCompleta extends NotaFiscalEntrada {
  itens: Array<{ id: string; produto_id: string; produto_nome: string; quantidade: number; custo_unitario: number | null }>
  parcelas: ContaPagar[]
}

export async function obterNotaEntrada(id: string): Promise<NotaEntradaCompleta | null> {
  const { data: nota, error } = await supabase
    .from('notas_fiscais_entrada')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!nota) return null

  const [{ data: movimentos, error: e2 }, parcelas] = await Promise.all([
    supabase
      .from('movimentacoes_estoque')
      .select('id, produto_id, quantidade, custo_unitario, produto:produtos(nome)')
      .eq('nota_fiscal_id', id)
      .eq('tipo', 'entrada'),
    contasDaNotaEntrada(id),
  ])
  if (e2) throw e2

  return {
    ...(nota as NotaFiscalEntrada),
    itens: ((movimentos ?? []) as unknown as Array<{
      id: string
      produto_id: string
      quantidade: number
      custo_unitario: number | null
      produto: { nome: string } | null
    }>).map((m) => ({
      id: m.id,
      produto_id: m.produto_id,
      produto_nome: m.produto?.nome ?? 'Produto removido',
      quantidade: Number(m.quantidade),
      custo_unitario: m.custo_unitario != null ? Number(m.custo_unitario) : null,
    })),
    parcelas,
  }
}

// Saída --------------------------------------------------------------------------

export interface NotaSaidaNaLista extends NotaFiscalSaida {
  cliente: Pick<Cliente, 'id' | 'nome' | 'telefone'> | null
}

export async function listarNotasSaida(opcoes: {
  busca: string
  status: StatusNota | 'todas'
}): Promise<NotaSaidaNaLista[]> {
  let consulta = supabase
    .from('notas_fiscais_saida')
    .select('*, cliente:clientes(id, nome, telefone)')
    .order('criado_em', { ascending: false })
    .limit(200)

  if (opcoes.status !== 'todas') consulta = consulta.eq('status', opcoes.status)
  const termo = limparBusca(opcoes.busca)
  if (termo) consulta = consulta.ilike('numero', `%${termo}%`)

  const { data, error } = await consulta
  if (error) throw error
  return (data ?? []) as unknown as NotaSaidaNaLista[]
}

/** Um item enquanto está sendo montado na tela, antes de virar linha gravada. */
export interface ItemSaidaEmEdicao {
  /** Identidade só na tela. */
  chave: string
  tipo: 'produto' | 'servico'
  produto_id: string | null
  servico_id: string | null
  descricao: string
  quantidade: number
  valor_unitario: number
  /** Vazio deixa o banco herdar do cadastro do produto. */
  ncm: string | null
  cfop_item: string | null
}

export interface DadosNotaSaida extends CamposFiscais {
  numero: string | null
  cliente_id: string | null
  /**
   * Presente = formaliza uma OS já finalizada (o estoque já baixou lá).
   * Ausente = venda de balcão (o estoque baixa agora, e recusa se faltar).
   */
  ordem_servico_id: string | null
  itens: ItemSaidaEmEdicao[]
  parcelas: number
  primeiro_vencimento: string | null
  forma_pagamento: FormaPagamento | null
}

export async function salvarNotaSaida(dados: DadosNotaSaida): Promise<string> {
  validarCamposFiscais(dados)
  validarItens(dados.itens)

  const itens: ItemNfSaidaPayload[] = dados.itens.map((i) => ({
    tipo: i.tipo,
    produto_id: i.produto_id,
    servico_id: i.servico_id,
    descricao: i.descricao,
    quantidade: i.quantidade,
    valor_unitario: i.valor_unitario,
    ncm: i.ncm,
    cfop_item: i.cfop_item,
  }))

  const { data, error } = await supabase.rpc('salvar_nota_saida_com_itens', {
    p_numero: dados.numero,
    p_cliente_id: dados.cliente_id,
    p_ordem_servico_id: dados.ordem_servico_id,
    p_natureza_operacao: dados.natureza_operacao ?? null,
    p_cfop: dados.cfop ?? null,
    p_base_calculo_icms: dados.base_calculo_icms ?? null,
    p_valor_icms: dados.valor_icms ?? null,
    p_base_calculo_iss: dados.base_calculo_iss ?? null,
    p_valor_iss: dados.valor_iss ?? null,
    p_itens: itens,
    p_parcelas: dados.parcelas,
    p_primeiro_vencimento: dados.primeiro_vencimento ?? undefined,
    p_forma_pagamento: dados.forma_pagamento,
  })
  if (error) throw error
  return data as string
}

export async function cancelarNotaSaida(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancelar_nota_saida', { p_nota_id: id })
  if (error) throw error
}

export interface ItemNfSaidaGravado {
  id: string
  tipo: 'produto' | 'servico'
  descricao: string
  quantidade: number
  valor_unitario: number
}

export interface NotaSaidaCompleta extends NotaFiscalSaida {
  cliente: Pick<Cliente, 'id' | 'nome' | 'telefone'> | null
  itens: ItemNfSaidaGravado[]
  parcelas: ContaReceber[]
}

export async function obterNotaSaida(id: string): Promise<NotaSaidaCompleta | null> {
  const { data: nota, error } = await supabase
    .from('notas_fiscais_saida')
    .select('*, cliente:clientes(id, nome, telefone), itens:itens_nf_saida(*)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!nota) return null

  const parcelas = await contasDaNotaSaida(id)
  const completa = nota as unknown as NotaSaidaCompleta
  return { ...completa, parcelas }
}

/** As cobranças que uma nota de saída gerou — para mostrar na tela da nota. */
export async function contasDaNotaSaida(notaId: string): Promise<ContaReceber[]> {
  const { data, error } = await supabase
    .from('contas_receber')
    .select('*')
    .eq('nota_fiscal_saida_id', notaId)
    .order('parcela')
  if (error) throw error
  return data ?? []
}

/** As parcelas que uma nota de entrada gerou — para mostrar na tela da nota. */
export async function contasDaNotaEntrada(notaId: string): Promise<ContaPagar[]> {
  const { data, error } = await supabase
    .from('contas_pagar')
    .select('*')
    .eq('nota_fiscal_entrada_id', notaId)
    .order('parcela')
  if (error) throw error
  return data ?? []
}
