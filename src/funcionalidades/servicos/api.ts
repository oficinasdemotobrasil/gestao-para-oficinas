import { supabase } from '@/lib/supabase'
import { limparBusca } from '@/lib/erros'
import type { Servico } from '@/tipos/banco'

export async function listarServicos(busca: string): Promise<Servico[]> {
  let consulta = supabase.from('servicos').select('*').order('nome')

  const termo = limparBusca(busca)
  if (termo) consulta = consulta.ilike('nome', `%${termo}%`)

  const { data, error } = await consulta.limit(200)
  if (error) throw error
  return data ?? []
}

export async function obterServico(id: string): Promise<Servico | null> {
  const { data, error } = await supabase
    .from('servicos')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export interface DadosServico {
  nome: string
  descricao: string | null
  preco: number
  tempo_estimado_minutos: number | null
  ativo: boolean
}

export async function criarServico(dados: DadosServico) {
  const { data, error } = await supabase.from('servicos').insert(dados).select().single()
  if (error) throw error
  return data
}

export async function atualizarServico(id: string, dados: DadosServico) {
  const { data, error } = await supabase
    .from('servicos')
    .update(dados)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function alternarAtivoServico(id: string, ativo: boolean) {
  const { error } = await supabase.from('servicos').update({ ativo }).eq('id', id)
  if (error) throw error
}
