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

/**
 * Guarda no catálogo um serviço que foi digitado como item avulso no orçamento.
 *
 * Reaproveita o que já existe com o mesmo nome em vez de criar outro: quem
 * digita "Solda no escapamento" toda semana acabaria com sete serviços iguais
 * no catálogo, e o preço de cada um seria o da semana em que foi digitado.
 *
 * O preço do orçamento não sobrescreve o do catálogo quando o serviço já
 * existe — o valor combinado com um cliente não é a tabela da oficina.
 */
export async function guardarServicoDoAvulso(
  nome: string,
  preco: number,
): Promise<{ id: string; jaExistia: boolean }> {
  const limpo = nome.trim()

  // '%' e '_' são curinga no ilike. Sem escapar, "Revisão 100% completa"
  // casaria com qualquer serviço que comece com "Revisão 100" — e o orçamento
  // apontaria para o serviço errado do catálogo.
  const semCuringa = limpo.replace(/([%_\\])/g, '\\$1')

  const { data: existente, error: erroBusca } = await supabase
    .from('servicos')
    .select('id')
    .ilike('nome', semCuringa)
    .limit(1)
    .maybeSingle()
  if (erroBusca) throw erroBusca
  if (existente) return { id: existente.id, jaExistia: true }

  const criado = await criarServico({
    nome: limpo,
    descricao: null,
    preco,
    tempo_estimado_minutos: null,
    ativo: true,
  })
  return { id: criado.id, jaExistia: false }
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
