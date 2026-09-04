import { supabase } from '@/lib/supabase'
import type { StatusOS, TipoItem } from '@/tipos/banco'

/**
 * O aplicativo do mecânico não passa por nenhuma tabela com dinheiro.
 *
 * Desde a migration 0033 ele perdeu a leitura de ordens_servico e os_itens, que
 * guardam valor e desconto — RLS filtra linha, não coluna, e não existe
 * política que devolva a ordem sem o total. O que ele recebe vem por estas
 * funções, que rodam como donas do banco e entregam campo por campo.
 *
 * Se um dia faltar alguma informação na tela dele, o lugar de acrescentar é a
 * função no banco, e não uma consulta nova aqui: é lá que a lista do que ele
 * pode ver fica visível de uma vez só.
 */

export interface OrdemNaListaDoMecanico {
  id: string
  numero: number
  status: StatusOS
  data_abertura: string
  km_entrada: number | null
  cliente_nome: string | null
  placa: string | null
  marca: string | null
  modelo: string | null
}

export interface ItemDoMecanico {
  id: string
  tipo: TipoItem
  descricao: string
  quantidade: number
  executado_em: string | null
}

export interface OrdemDoMecanico extends OrdemNaListaDoMecanico {
  garantia_ate: string | null
  observacoes_tecnicas: string | null
  itens: ItemDoMecanico[]
}

/** Só as que ainda têm serviço, em andamento primeiro. A função já ordena. */
export async function ordensDoMecanico(): Promise<OrdemNaListaDoMecanico[]> {
  const { data, error } = await supabase.rpc('ordens_do_mecanico')
  if (error) throw error
  return (data ?? []) as OrdemNaListaDoMecanico[]
}

export async function osDoMecanico(id: string): Promise<OrdemDoMecanico> {
  const { data, error } = await supabase.rpc('os_do_mecanico', {
    p_ordem_servico_id: id,
  })
  if (error) throw error
  return data as OrdemDoMecanico
}

export async function marcarItemExecutado(itemId: string, feito: boolean): Promise<void> {
  const { error } = await supabase.rpc('marcar_item_executado', {
    p_item_id: itemId,
    p_feito: feito,
  })
  if (error) throw error
}
