import { supabase } from '@/lib/supabase'
import type { TipoMovimentacao } from '@/tipos/banco'

/**
 * Todo mundo lê o extrato pela view vw_movimentacoes, inclusive o admin.
 * A view não traz custo_unitario — e o extrato não precisa dele. O custo de
 * compra aparece na tela da nota fiscal, que é do admin.
 */
export interface Movimentacao {
  id: string
  produto_id: string
  produto_nome: string
  produto_unidade: string
  tipo: TipoMovimentacao
  quantidade: number
  motivo: string | null
  nota_fiscal_id: string | null
  ordem_servico_id: string | null
  usuario_nome: string | null
  criado_em: string
}

export type Periodo = 'hoje' | '7dias' | '30dias' | 'tudo'

/** Data de corte do filtro, em ISO, ou null quando o filtro é "tudo". */
function corteDoPeriodo(periodo: Periodo): string | null {
  if (periodo === 'tudo') return null
  const dias = periodo === 'hoje' ? 0 : periodo === '7dias' ? 7 : 30
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - dias)
  return d.toISOString()
}

export async function listarMovimentacoes(opcoes: {
  periodo: Periodo
  tipo: TipoMovimentacao | 'todos'
  produtoId?: string
}): Promise<Movimentacao[]> {
  let consulta = supabase
    .from('vw_movimentacoes')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(200)

  const corte = corteDoPeriodo(opcoes.periodo)
  if (corte) consulta = consulta.gte('criado_em', corte)
  if (opcoes.tipo !== 'todos') consulta = consulta.eq('tipo', opcoes.tipo)
  if (opcoes.produtoId) consulta = consulta.eq('produto_id', opcoes.produtoId)

  const { data, error } = await consulta
  if (error) throw error
  return (data ?? []) as unknown as Movimentacao[]
}

/**
 * Lança a movimentação pela função do banco.
 *
 * Não é insert direto de propósito: a tabela guarda custo_unitario, que é preço
 * de custo, e o vendedor não pode ler essa coluna. A função devolve só o saldo
 * novo. Ver migration 0019.
 */
export async function registrarMovimentacao(dados: {
  produtoId: string
  tipo: TipoMovimentacao
  quantidade: number
  motivo: string
}): Promise<number> {
  const { data, error } = await supabase.rpc('registrar_movimentacao', {
    p_produto_id: dados.produtoId,
    p_tipo: dados.tipo,
    p_quantidade: dados.quantidade,
    p_motivo: dados.motivo,
  })
  if (error) throw error
  return Number(data)
}

export interface ProdutoParaRepor {
  id: string
  nome: string
  unidade: string
  estoque_atual: number
  estoque_minimo: number
}

/**
 * Produtos no limite ou abaixo do mínimo.
 *
 * A comparação entre duas colunas não cabe no filtro do PostgREST, então vem
 * tudo o que tem mínimo definido e o corte acontece aqui. São dezenas de itens
 * numa oficina, não milhares.
 */
export async function produtosParaRepor(): Promise<ProdutoParaRepor[]> {
  const { data, error } = await supabase
    .from('vw_produtos')
    .select('id, nome, unidade, estoque_atual, estoque_minimo')
    .eq('ativo', true)
    .gt('estoque_minimo', 0)
    .order('nome')

  if (error) throw error

  return (data ?? [])
    .map((p) => ({
      id: p.id,
      nome: p.nome,
      unidade: p.unidade,
      estoque_atual: Number(p.estoque_atual),
      estoque_minimo: Number(p.estoque_minimo),
    }))
    .filter((p) => p.estoque_atual <= p.estoque_minimo)
}
