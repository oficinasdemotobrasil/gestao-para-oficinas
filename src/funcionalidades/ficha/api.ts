import { supabase } from '@/lib/supabase'
import type { Database } from '@/tipos/banco'

/**
 * A ficha completa: uma chamada devolve o cruzamento inteiro — serviços,
 * orçamentos, notas, peças, dinheiro (migration 0064).
 */
export type FichaDoCliente = Database['public']['Functions']['ficha_do_cliente']['Returns']
export type FichaDaMoto = Database['public']['Functions']['ficha_da_moto']['Returns']

export async function fichaDoCliente(clienteId: string): Promise<FichaDoCliente> {
  const { data, error } = await supabase.rpc('ficha_do_cliente', { p_cliente: clienteId })
  if (error) throw error
  return data
}

export async function fichaDaMoto(motoId: string): Promise<FichaDaMoto> {
  const { data, error } = await supabase.rpc('ficha_da_moto', { p_moto: motoId })
  if (error) throw error
  return data
}
