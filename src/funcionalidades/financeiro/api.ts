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
