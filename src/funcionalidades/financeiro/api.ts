import { hojeNoAparelho } from '@/lib/formato'
import { supabase } from '@/lib/supabase'
import type { Cliente, ContaPagar, ContaReceber, FormaPagamento, StatusConta } from '@/tipos/banco'

export const FORMAS: Array<{ id: FormaPagamento; rotulo: string }> = [
  { id: 'dinheiro', rotulo: 'Dinheiro' },
  { id: 'pix', rotulo: 'PIX' },
  { id: 'debito', rotulo: 'Débito' },
  { id: 'credito', rotulo: 'Crédito' },
  { id: 'transferencia', rotulo: 'Transferência' },
  { id: 'prazo', rotulo: 'A prazo' },
]

export const rotuloDaForma = (f: FormaPagamento | null): string =>
  FORMAS.find((x) => x.id === f)?.rotulo ?? '—'

/**
 * "Atrasada" não está gravada em lugar nenhum: é o status somado ao calendário.
 *
 * Mesma escolha do orçamento expirado. Gravar exigiria alguém rodando uma
 * tarefa todo dia, e um dia sem rodar mostraria conta vencida como em dia — o
 * erro que ninguém percebe. O banco tem a mesma conta em status_da_conta(),
 * para quando o cálculo precisa acontecer lá.
 */
export function statusDaConta(conta: {
  status: StatusConta
  vencimento: string
  valor: number
  valor_recebido?: number
}): StatusConta {
  if (conta.status !== 'aberta') return conta.status
  if ((conta.valor_recebido ?? 0) >= Number(conta.valor)) return 'paga'
  const hoje = new Date().toISOString().slice(0, 10)
  return conta.vencimento < hoje ? 'atrasada' : 'aberta'
}

export interface ContaAReceber extends ContaReceber {
  cliente: Pick<Cliente, 'id' | 'nome' | 'telefone'> | null
}

export interface FiltroDeContas {
  status: StatusConta | 'todas'
  de: string
  ate: string
}

function aplicarPeriodo<T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(
  consulta: T,
  filtro: FiltroDeContas,
): T {
  let c = consulta
  if (filtro.de) c = c.gte('vencimento', filtro.de)
  if (filtro.ate) c = c.lte('vencimento', filtro.ate)
  return c
}

export async function listarContasAReceber(filtro: FiltroDeContas): Promise<ContaAReceber[]> {
  let consulta = supabase
    .from('contas_receber')
    .select('*, cliente:clientes(id, nome, telefone)')
    .order('vencimento')
    .limit(300)

  consulta = aplicarPeriodo(consulta, filtro)

  const { data, error } = await consulta
  if (error) throw error

  const lista = (data ?? []) as unknown as ContaAReceber[]
  // 'atrasada' não existe no banco: filtra depois de calcular.
  if (filtro.status === 'todas') return lista
  return lista.filter((c) => statusDaConta(c) === filtro.status)
}

export async function listarContasAPagar(filtro: FiltroDeContas): Promise<ContaPagar[]> {
  let consulta = supabase.from('contas_pagar').select('*').order('vencimento').limit(300)
  consulta = aplicarPeriodo(consulta, filtro)

  const { data, error } = await consulta
  if (error) throw error

  const lista = data ?? []
  if (filtro.status === 'todas') return lista
  return lista.filter((c) => statusDaConta({ ...c, valor_recebido: 0 }) === filtro.status)
}

export async function criarCobrancaDaOs(
  ordemId: string,
  parcelas: number,
  primeiroVencimento: string,
  forma: FormaPagamento | null,
): Promise<number> {
  const { data, error } = await supabase.rpc('criar_cobranca_da_os', {
    p_ordem_servico_id: ordemId,
    p_parcelas: parcelas,
    p_primeiro_vencimento: primeiroVencimento,
    p_forma_pagamento: forma,
  })
  if (error) throw error
  return data as number
}

export async function receberConta(
  contaId: string,
  valor: number | null,
  data: string,
  forma: FormaPagamento | null,
): Promise<void> {
  const { error } = await supabase.rpc('receber_conta', {
    p_conta_id: contaId,
    p_valor: valor,
    p_data: data,
    p_forma_pagamento: forma,
  })
  if (error) throw error
}

/** O que aconteceu com a comissão do indicador ao dar ou desfazer um desconto. */
export type ComissaoNoDesconto = 'ajustada' | 'ja_paga' | null

/**
 * Desconto na hora de receber (0083). Só o dono dá — o banco confere.
 *
 * O valor da conta passa a ser o valor com desconto, e a comissão do
 * indicador cai junto se ainda não foi paga. Com `receber`, dá o desconto e a
 * baixa numa operação só: ou ficam os dois, ou nenhum.
 */
export async function darDesconto(
  contaId: string,
  desconto: number,
  motivo: string,
  receber?: { valor: number | null; data: string; forma: FormaPagamento | null },
): Promise<ComissaoNoDesconto> {
  const { data, error } = await supabase.rpc('dar_desconto', {
    p_conta_id: contaId,
    p_desconto: desconto,
    p_motivo: motivo,
    p_receber: Boolean(receber),
    p_valor_recebido: receber?.valor ?? null,
    p_data: receber?.data ?? hojeNoAparelho(),
    p_forma_pagamento: receber?.forma ?? null,
  })
  if (error) throw error
  return data?.comissao ?? null
}

/** Volta a conta ao valor original; a comissão volta junto, se não foi paga. */
export async function desfazerDesconto(contaId: string, motivo: string): Promise<ComissaoNoDesconto> {
  const { data, error } = await supabase.rpc('desfazer_desconto', {
    p_conta_id: contaId,
    p_motivo: motivo,
  })
  if (error) throw error
  return data?.comissao ?? null
}

/**
 * Corrige o que foi registrado na baixa: forma, data e valor recebido.
 *
 * Diferente de receber de novo — receber soma ao que já entrou, corrigir
 * substitui. Campo nulo quer dizer "mantém", então a tela manda só o que a
 * pessoa mexeu.
 */
export async function corrigirRecebimento(
  contaId: string,
  valor: number | null,
  data: string | null,
  forma: FormaPagamento | null,
  motivo: string,
): Promise<void> {
  const { error } = await supabase.rpc('corrigir_recebimento', {
    p_conta_id: contaId,
    p_valor: valor,
    p_data: data,
    p_forma: forma,
    p_motivo: motivo,
  })
  if (error) throw error
}

export async function corrigirPagamento(
  contaId: string,
  data: string | null,
  forma: FormaPagamento | null,
  motivo: string,
): Promise<void> {
  const { error } = await supabase.rpc('corrigir_pagamento', {
    p_conta_id: contaId,
    p_data: data,
    p_forma: forma,
    p_motivo: motivo,
  })
  if (error) throw error
}

export interface CorrecaoFinanceira {
  id: string
  de: string
  para: string
  motivo: string
  criado_em: string
  /** Quem corrigiu. Nulo se a pessoa foi removida da oficina depois. */
  quem: string | null
}

/** O histórico de correções de uma conta, para a tela poder mostrar quem mexeu. */
export async function correcoesDaConta(
  contaId: string,
  tipo: 'receber' | 'pagar',
): Promise<CorrecaoFinanceira[]> {
  const consulta = supabase
    .from('correcoes_financeiras')
    .select('*')
    .order('criado_em', { ascending: false })

  const { data, error } =
    tipo === 'receber'
      ? await consulta.eq('conta_receber_id', contaId)
      : await consulta.eq('conta_pagar_id', contaId)

  if (error) throw error
  const linhas = data ?? []
  if (linhas.length === 0) return []

  // O nome de quem corrigiu vem numa consulta à parte, e não por junção: os
  // tipos gerados não modelam essa ligação, e forçá-la custaria mais do que
  // uma segunda ida ao banco para meia dúzia de linhas.
  const { data: pessoas } = await supabase.from('usuarios').select('id, nome')
  const nomes = new Map((pessoas ?? []).map((p) => [p.id, p.nome]))

  return linhas.map((l) => ({
    id: l.id,
    de: l.de,
    para: l.para,
    motivo: l.motivo,
    criado_em: l.criado_em,
    quem: l.usuario_id ? (nomes.get(l.usuario_id) ?? null) : null,
  }))
}

export async function cancelarContaReceber(contaId: string): Promise<void> {
  const { error } = await supabase.rpc('cancelar_conta_receber', { p_conta_id: contaId })
  if (error) throw error
}

export async function lancarContaAPagar(dados: {
  descricao: string
  valor: number
  vencimento: string
  fornecedor: string | null
  categoria: string | null
  repetirMeses: number
}): Promise<number> {
  const { data, error } = await supabase.rpc('lancar_conta_a_pagar', {
    p_descricao: dados.descricao,
    p_valor: dados.valor,
    p_vencimento: dados.vencimento,
    p_fornecedor: dados.fornecedor,
    p_categoria: dados.categoria,
    p_repetir_meses: dados.repetirMeses,
  })
  if (error) throw error
  return data as number
}

export async function pagarConta(
  contaId: string,
  data: string,
  forma: FormaPagamento | null,
): Promise<void> {
  const { error } = await supabase.rpc('pagar_conta', {
    p_conta_id: contaId,
    p_data: data,
    p_forma_pagamento: forma,
  })
  if (error) throw error
}

/** O resumo do topo. Somado aqui porque a lista já veio inteira do servidor. */
export function resumo(receber: ContaAReceber[], pagar: ContaPagar[]) {
  const emAberto = (c: { status: StatusConta }) => c.status !== 'cancelada'

  const aReceber = receber
    .filter((c) => emAberto(c) && statusDaConta(c) !== 'paga')
    .reduce((a, c) => a + (Number(c.valor) - Number(c.valor_recebido)), 0)

  const recebido = receber
    .filter(emAberto)
    .reduce((a, c) => a + Number(c.valor_recebido), 0)

  const atrasado = receber
    .filter((c) => statusDaConta(c) === 'atrasada')
    .reduce((a, c) => a + (Number(c.valor) - Number(c.valor_recebido)), 0)

  const aPagar = pagar
    .filter((c) => emAberto(c) && c.status !== 'paga')
    .reduce((a, c) => a + Number(c.valor), 0)

  return { aReceber, recebido, atrasado, aPagar, saldo: aReceber - aPagar }
}

/** A ordem já virou cobrança? Usado para não oferecer duas vezes. */
export async function contasDaOs(ordemId: string): Promise<ContaReceber[]> {
  const { data, error } = await supabase
    .from('contas_receber')
    .select('*')
    .eq('ordem_servico_id', ordemId)
    .order('vencimento')
  if (error) throw error
  return data ?? []
}
