import { supabase } from '@/lib/supabase'
import type { Comissao, Database, Indicador, StatusComissao } from '@/tipos/banco'

export type ResumoDeIndicadores =
  Database['public']['Functions']['indicadores_com_comissoes']['Returns']
export type IndicadorNoResumo = ResumoDeIndicadores['indicadores'][number]

/**
 * Os indicadores com o que a oficina deve a cada um — numa chamada só, porque
 * a lista com os números ao lado É a tela: buscar o total de cada um seria uma
 * consulta por linha.
 */
export async function indicadoresComComissoes(): Promise<ResumoDeIndicadores> {
  const { data, error } = await supabase.rpc('indicadores_com_comissoes')
  if (error) throw error
  return data
}

export interface DadosIndicador {
  nome: string
  telefone: string | null
  codigo: string
  /** Nulo usa o percentual da oficina. */
  percentual: number | null
  ativo: boolean
  observacoes: string | null
}

export async function criarIndicador(dados: DadosIndicador): Promise<Indicador> {
  const { data, error } = await supabase.from('indicadores').insert(dados).select().single()
  if (error) throw error
  return data
}

export async function atualizarIndicador(id: string, dados: DadosIndicador): Promise<Indicador> {
  const { data, error } = await supabase
    .from('indicadores')
    .update(dados)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function obterIndicador(id: string): Promise<Indicador | null> {
  const { data, error } = await supabase.from('indicadores').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/** Acha o indicador pelo código ditado pelo cliente. Nulo: não existe. */
export async function indicadorPeloCodigo(codigo: string) {
  const { data, error } = await supabase.rpc('indicador_por_codigo', { p_codigo: codigo })
  if (error) throw error
  return data?.[0] ?? null
}

export interface ComissaoNaLista extends Comissao {
  indicador: Pick<Indicador, 'id' | 'nome' | 'codigo'> | null
  orcamento: { numero: number } | null
  ordem: { numero: number } | null
}

export async function listarComissoes(status: StatusComissao): Promise<ComissaoNaLista[]> {
  const { data, error } = await supabase
    .from('comissoes')
    .select(
      `*,
       indicador:indicadores(id, nome, codigo),
       orcamento:orcamentos(numero),
       ordem:ordens_servico(numero)`,
    )
    .eq('status', status)
    .order('criado_em', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []) as unknown as ComissaoNaLista[]
}

export async function pagarComissao(id: string): Promise<void> {
  const { error } = await supabase.rpc('pagar_comissao', { p_comissao_id: id })
  if (error) throw error
}

export async function desfazerPagamento(id: string): Promise<void> {
  const { error } = await supabase.rpc('desfazer_pagamento_da_comissao', { p_comissao_id: id })
  if (error) throw error
}
