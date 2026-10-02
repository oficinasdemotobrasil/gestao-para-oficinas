/**
 * Peça reservada: a que já está prometida para uma ordem de serviço em aberto.
 *
 * O pedido da oficina era tirar a peça do estoque já na aprovação, para o
 * balcão não vender a peça que está guardada para uma moto. A reserva resolve
 * isso sem mexer no estoque de verdade, e é por isso que ela existe em vez da
 * baixa antecipada:
 *
 * - a baixa continua na finalização (0029), que é quando a peça entra na moto;
 * - trocar peça no meio do serviço ou cancelar a ordem não gera entrada e
 *   saída no extrato — a reserva simplesmente acompanha os itens;
 * - não há virada: as ordens que já estavam abertas passam a reservar no mesmo
 *   instante, sem risco de baixar duas vezes.
 *
 * Nada é gravado. A reserva é calculada na leitura, a partir dos itens das
 * ordens que ainda não terminaram — a mesma escolha do orçamento expirado e da
 * conta atrasada: um número guardado pode descolar da realidade, um número
 * calculado não.
 *
 * Quem lê é o atendimento (dono e balcão), que enxerga todas as ordens. O
 * mecânico vê só as dele e não usa estas telas.
 */
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { quantidade } from '@/lib/formato'
import type { StatusOS } from '@/tipos/banco'

/** As etapas em que a peça está prometida e ainda não saiu da prateleira. */
const STATUS_QUE_RESERVAM: StatusOS[] = [
  'aberta',
  'em_andamento',
  'pausada',
  'aguardando_conferencia',
]

export interface ReservaDoProduto {
  total: number
  ordens: { id: string; numero: number; quantidade: number }[]
}

export type Reservas = Map<string, ReservaDoProduto>

export async function listarReservas(): Promise<Reservas> {
  const { data, error } = await supabase
    .from('os_itens')
    .select('produto_id, quantidade, ordem:ordens_servico!inner(id, numero, status)')
    .eq('tipo', 'produto')
    .not('produto_id', 'is', null)
    .in('ordem.status', STATUS_QUE_RESERVAM)

  if (error) throw error

  const reservas: Reservas = new Map()
  for (const item of data ?? []) {
    const ordem = item.ordem as unknown as { id: string; numero: number }
    const qtd = Number(item.quantidade)
    const atual = reservas.get(item.produto_id!) ?? { total: 0, ordens: [] }
    atual.total += qtd
    // A mesma peça pode aparecer duas vezes na mesma ordem.
    const naOrdem = atual.ordens.find((o) => o.id === ordem.id)
    if (naOrdem) naOrdem.quantidade += qtd
    else atual.ordens.push({ id: ordem.id, numero: ordem.numero, quantidade: qtd })
    reservas.set(item.produto_id!, atual)
  }
  for (const r of reservas.values()) r.ordens.sort((a, b) => a.numero - b.numero)
  return reservas
}

const CHAVE = ['reservas'] as const

/*
 * Sem tempo de validade: a reserva muda a cada ordem aprovada, editada ou
 * finalizada, em qualquer celular da oficina. Mostrar o número de meio minuto
 * atrás é exatamente o erro que ela existe para evitar.
 */
export function useReservas(ativo = true) {
  return useQuery({ queryKey: CHAVE, queryFn: listarReservas, staleTime: 0, enabled: ativo })
}

/** Para as buscas de peça, que rodam fora de componente. */
export function buscarReservas(cache: QueryClient) {
  return cache.fetchQuery({ queryKey: CHAVE, queryFn: listarReservas, staleTime: 5_000 })
}

export function reservado(reservas: Reservas | undefined, produtoId: string): number {
  return reservas?.get(produtoId)?.total ?? 0
}

/**
 * O texto do estoque nas listas de escolha. Sem reserva, fica como era; com
 * reserva, diz quanto dá para usar de fato.
 */
export function textoDoEstoque(
  emEstoque: number | string,
  unidade: string,
  reservas: Reservas | undefined,
  produtoId: string,
): string {
  const saldo = Number(emEstoque)
  const r = reservado(reservas, produtoId)
  if (r <= 0) return `${quantidade(saldo)} ${unidade} em estoque`
  return `${quantidade(saldo)} ${unidade} em estoque · ${quantidade(r)} reservad${r === 1 ? 'o' : 'os'} · ${quantidade(Math.max(saldo - r, 0))} livre${saldo - r === 1 ? '' : 's'}`
}

export interface PecaCurta {
  nome: string
  unidade: string
  precisa: number
  emEstoque: number
  reservado: number
  livre: number
}

/**
 * As peças de um orçamento que não têm quantidade livre para ele.
 *
 * Serve ao "O cliente aprovou": é a hora em que o balcão promete prazo ao
 * cliente, e prometer com a peça já comprometida em outra moto é o problema
 * que a reserva veio resolver. Avisa, não barra — a peça pode estar chegando,
 * e quem decide é quem está no balcão.
 *
 * Lê pela vw_produtos, que dono e balcão alcançam e que não traz custo.
 */
export async function pecasSemSaldoLivre(
  itens: { tipo: string; produto_id: string | null; quantidade: number | string }[],
): Promise<PecaCurta[]> {
  const precisa = new Map<string, number>()
  for (const i of itens) {
    if (i.tipo !== 'produto' || !i.produto_id) continue
    precisa.set(i.produto_id, (precisa.get(i.produto_id) ?? 0) + Number(i.quantidade))
  }
  if (precisa.size === 0) return []

  const [produtos, reservas] = await Promise.all([
    supabase.from('vw_produtos').select('id, nome, unidade, estoque_atual').in('id', [...precisa.keys()]),
    listarReservas(),
  ])
  if (produtos.error) throw produtos.error

  const curtas: PecaCurta[] = []
  for (const p of produtos.data ?? []) {
    const emEstoque = Number(p.estoque_atual)
    const r = reservado(reservas, p.id!)
    const livre = Math.max(emEstoque - r, 0)
    const qtd = precisa.get(p.id!) ?? 0
    if (livre < qtd) {
      curtas.push({ nome: p.nome!, unidade: p.unidade!, precisa: qtd, emEstoque, reservado: r, livre })
    }
  }
  return curtas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}
