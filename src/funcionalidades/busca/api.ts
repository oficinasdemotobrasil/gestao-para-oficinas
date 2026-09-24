import { supabase } from '@/lib/supabase'
import type { Database, StatusOS } from '@/tipos/banco'

/**
 * A busca do balcão: uma chamada devolve cliente, moto e ordem de serviço.
 *
 * É uma função do banco (migration 0062) e não três consultas daqui porque a
 * internet da oficina é ruim: três idas e voltas com o cliente esperando na
 * frente do balcão parecem sistema travado.
 */
export interface MotoEncontrada {
  id: string
  placa: string
  marca: string | null
  modelo: string | null
  ano: number | null
  km_atual: number
  dono_id: string | null
  dono_nome: string | null
  dono_telefone: string | null
  /** Quando a moto saiu daqui pela última vez. Nulo: nunca fizemos serviço nela. */
  ultimo_servico: string | null
  servicos_abertos: number
}

export interface ClienteEncontrado {
  id: string
  nome: string
  telefone: string | null
  motos: Array<{ id: string; placa: string; marca: string | null; modelo: string | null }>
  /** Zero para quem não pode ver dinheiro — o RLS decide, não a tela. */
  em_aberto: number
}

export interface OrdemEncontrada {
  id: string
  numero: number
  status: StatusOS
  data: string
  valor: number
  placa: string | null
  cliente_nome: string | null
}

export type Resultado = Database['public']['Functions']['busca_geral']['Returns']

export async function buscar(termo: string): Promise<Resultado> {
  const { data, error } = await supabase.rpc('busca_geral', { p_termo: termo })
  if (error) throw error
  return data
}

export const vazio = (r: Resultado | undefined): boolean =>
  !r || (r.clientes.length === 0 && r.motos.length === 0 && r.ordens.length === 0)
