import { supabase } from '@/lib/supabase'
import type { Database } from '@/tipos/banco'

export type DadosDoPainel = Database['public']['Functions']['painel']['Returns']
export type ClienteInativo =
  Database['public']['Functions']['clientes_inativos']['Returns'][number]
export type ServicoNoHistorico =
  Database['public']['Functions']['historico_da_placa']['Returns'][number]

/**
 * Um número por chamada, e não o movimento inteiro para somar no celular.
 *
 * A conta acontece no banco (migration 0036). Baixar as ordens, os orçamentos e
 * as contas do mês para calcular aqui seria caro na internet da oficina e lento
 * na tela — e o dono abre isto entre um cliente e outro.
 */
export async function obterPainel(de: string, ate: string): Promise<DadosDoPainel> {
  const { data, error } = await supabase.rpc('painel', { p_de: de, p_ate: ate })
  if (error) throw error
  return data as DadosDoPainel
}

export async function listarClientesInativos(dias: number | null): Promise<ClienteInativo[]> {
  const { data, error } = await supabase.rpc('clientes_inativos', { p_dias: dias })
  if (error) throw error
  return (data ?? []) as ClienteInativo[]
}

export async function historicoDaPlaca(motoId: string): Promise<ServicoNoHistorico[]> {
  const { data, error } = await supabase.rpc('historico_da_placa', { p_moto_id: motoId })
  if (error) throw error
  return (data ?? []) as ServicoNoHistorico[]
}

/** Os períodos que o dono usa. "Personalizado" abre os dois campos de data. */
export type Periodo = 'hoje' | '7dias' | 'mes' | 'ano' | 'personalizado'

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function datasDoPeriodo(periodo: Periodo): { de: string; ate: string } {
  const hoje = new Date()
  switch (periodo) {
    case 'hoje':
      return { de: iso(hoje), ate: iso(hoje) }
    case '7dias': {
      const antes = new Date(hoje)
      antes.setDate(antes.getDate() - 6)
      return { de: iso(antes), ate: iso(hoje) }
    }
    // O ano inteiro: é o período em que o serviço antigo aparece junto do
    // resto, porque ele é sempre de antes de a oficina entrar no sistema.
    case 'ano':
      return { de: iso(new Date(hoje.getFullYear(), 0, 1)), ate: iso(new Date(hoje.getFullYear(), 11, 31)) }
    default: {
      const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
      const ultimo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
      return { de: iso(primeiro), ate: iso(ultimo) }
    }
  }
}
