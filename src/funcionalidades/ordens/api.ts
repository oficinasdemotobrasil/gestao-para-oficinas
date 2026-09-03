import { supabase } from '@/lib/supabase'
import type { Cliente, Moto, Orcamento, OrdemServico, OsItem, Usuario } from '@/tipos/banco'

export interface OrdemCompleta extends OrdemServico {
  cliente: Pick<Cliente, 'id' | 'nome' | 'telefone'> | null
  moto: Pick<Moto, 'id' | 'placa' | 'marca' | 'modelo'> | null
  responsavel: Pick<Usuario, 'id' | 'nome' | 'perfil'> | null
  /**
   * O orçamento que deu origem à ordem, quando houve um.
   *
   * O valor da OS já não sai daqui — ela guarda o próprio (migration 0026).
   * Este continua vindo por dois motivos: o link "ver o orçamento aprovado", e
   * o aviso de que a ordem passou do que o cliente aceitou. Vem nulo para o
   * mecânico, que não lê orçamento — e para ele nenhum dos dois faz falta.
   */
  orcamento: Pick<Orcamento, 'numero' | 'valor_total'> | null
  itens: OsItem[]
}

export async function obterOrdemServico(id: string): Promise<OrdemCompleta | null> {
  const { data, error } = await supabase
    .from('ordens_servico')
    .select(
      `*,
       cliente:clientes(id, nome, telefone),
       moto:motos(id, placa, marca, modelo),
       responsavel:usuarios(id, nome, perfil),
       orcamento:orcamentos(numero, valor_total),
       itens:os_itens(*)`,
    )
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const completa = data as unknown as OrdemCompleta
  completa.itens = [...(completa.itens ?? [])].sort((a, b) =>
    a.criado_em.localeCompare(b.criado_em),
  )
  return completa
}

/**
 * A OS que nasceu deste orçamento, para o botão "Ver ordem de serviço".
 *
 * Vem por consulta e não por coluna no orçamento porque a ligação é do lado da
 * OS (`orcamento_id`): o orçamento não sabe que virou ordem, e não deveria
 * saber — ele é o documento que o cliente aprovou, congelado.
 */
export async function obterOrdemDoOrcamento(
  orcamentoId: string,
): Promise<Pick<OrdemServico, 'id' | 'numero' | 'status'> | null> {
  const { data, error } = await supabase
    .from('ordens_servico')
    .select('id, numero, status')
    .eq('orcamento_id', orcamentoId)
    .maybeSingle()
  if (error) throw error
  return data
}

/** A ordem como ela aparece numa lista, sem os itens. */
export interface OrdemNaLista extends OrdemServico {
  cliente: Pick<Cliente, 'id' | 'nome'> | null
  moto: Pick<Moto, 'id' | 'placa' | 'marca' | 'modelo'> | null
}

/**
 * As ordens em aberto, da mais antiga para a mais nova.
 *
 * Sem filtro por pessoa de propósito: o mecânico já recebe só as dele, pelo
 * RLS. Filtrar aqui de novo seria repetir no app uma regra que é do banco — e
 * duas cópias da mesma regra é como uma delas fica para trás.
 */
export async function listarOrdensEmAberto(): Promise<OrdemNaLista[]> {
  const { data, error } = await supabase
    .from('ordens_servico')
    .select('*, cliente:clientes(id, nome), moto:motos(id, placa, marca, modelo)')
    .in('status', ['aberta', 'em_andamento', 'pausada'])
    .order('data_abertura', { ascending: true })
    .limit(100)
  if (error) throw error
  return (data ?? []) as unknown as OrdemNaLista[]
}
