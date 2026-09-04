import { supabase } from '@/lib/supabase'
import { limparBusca } from '@/lib/erros'
import { normalizarPlaca } from '@/lib/formato'
import type {
  Cliente,
  Moto,
  Orcamento,
  OrdemServico,
  OsItem,
  StatusOS,
  Usuario,
} from '@/tipos/banco'

/** Uma virada de status, com quem virou e quando. */
export interface PassoDoStatus {
  id: string
  de: StatusOS | null
  para: StatusOS
  criado_em: string
  usuario: Pick<Usuario, 'id' | 'nome'> | null
}

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
  historico: PassoDoStatus[]
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
       itens:os_itens(*),
       historico:os_status_historico(id, de, para, criado_em, usuario:usuarios(id, nome))`,
    )
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const completa = data as unknown as OrdemCompleta
  completa.itens = [...(completa.itens ?? [])].sort((a, b) =>
    a.criado_em.localeCompare(b.criado_em),
  )
  completa.historico = [...(completa.historico ?? [])].sort((a, b) =>
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

export interface FiltroDeOrdens {
  busca: string
  status: StatusOS | 'todas' | 'em_aberto'
  responsavelId: string | 'todos'
  /** Data de abertura, no formato aaaa-mm-dd. Vazio é sem limite. */
  de: string
  ate: string
}

/** Aberta, em andamento, pausada ou aguardando conferência: ainda tem serviço. */
export const STATUS_EM_ABERTO: StatusOS[] = [
  'aberta',
  'em_andamento',
  'pausada',
  'aguardando_conferencia',
]

export async function listarOrdens(filtro: FiltroDeOrdens): Promise<OrdemNaLista[]> {
  let consulta = supabase
    .from('ordens_servico')
    .select('*, cliente:clientes(id, nome), moto:motos(id, placa, marca, modelo)')
    .order('numero', { ascending: false })
    .limit(200)

  if (filtro.status === 'em_aberto') {
    consulta = consulta.in('status', STATUS_EM_ABERTO)
  } else if (filtro.status !== 'todas') {
    consulta = consulta.eq('status', filtro.status)
  }

  if (filtro.responsavelId !== 'todos') {
    consulta = consulta.eq('responsavel_id', filtro.responsavelId)
  }
  if (filtro.de) consulta = consulta.gte('data_abertura', filtro.de)
  // O 'ate' é o dia inteiro, e data_abertura tem hora: sem somar um dia, tudo
  // que foi aberto depois da meia-noite do último dia ficava de fora.
  if (filtro.ate) consulta = consulta.lt('data_abertura', `${filtro.ate}T23:59:59.999`)

  const { data, error } = await consulta
  if (error) throw error

  let lista = (data ?? []) as unknown as OrdemNaLista[]

  // Cliente e placa moram em outras tabelas: o filtro do PostgREST não cruza as
  // três numa consulta só. Mesma escolha da lista de orçamentos.
  const termo = limparBusca(filtro.busca)
  if (termo) {
    const numero = Number(termo.replace(/\D/g, ''))
    if (/^\d+$/.test(termo.trim()) && Number.isFinite(numero)) {
      lista = lista.filter((o) => o.numero === numero)
    } else {
      const alvo = termo.toLowerCase()
      const placa = normalizarPlaca(termo)
      lista = lista.filter(
        (o) =>
          o.cliente?.nome.toLowerCase().includes(alvo) ||
          (placa && o.moto?.placa.includes(placa)),
      )
    }
  }

  return lista
}

/**
 * Avança ou recua o status. Finalizar e cancelar não passam por aqui: eles
 * mexem no estoque e têm caminho próprio.
 */
export async function mudarStatusDaOs(id: string, status: StatusOS): Promise<void> {
  const { error } = await supabase.rpc('mudar_status_da_os', {
    p_ordem_servico_id: id,
    p_status: status,
  })
  if (error) throw error
}

export async function atribuirResponsavel(id: string, responsavelId: string): Promise<void> {
  const { error } = await supabase
    .from('ordens_servico')
    .update({ responsavel_id: responsavelId })
    .eq('id', id)
  if (error) throw error
}

export async function salvarObservacoesTecnicas(id: string, texto: string): Promise<void> {
  const { error } = await supabase
    .from('ordens_servico')
    .update({ observacoes_tecnicas: texto.trim() || null })
    .eq('id', id)
  if (error) throw error
}

export interface ItemNovoDaOs {
  tipo: 'produto' | 'servico' | 'avulso'
  produto_id: string | null
  servico_id: string | null
  descricao: string
  quantidade: number
  valor_unitario: number
}

/**
 * O total da ordem não é enviado daqui: um gatilho no banco recalcula sozinho
 * a cada item que entra, muda ou sai (migration 0026). Mandar o total pela
 * tela abriria espaço para dois celulares gravarem contas diferentes.
 */
export async function adicionarItemNaOs(ordemId: string, item: ItemNovoDaOs): Promise<void> {
  const { error } = await supabase.from('os_itens').insert({
    ordem_servico_id: ordemId,
    tipo: item.tipo,
    produto_id: item.produto_id,
    servico_id: item.servico_id,
    descricao: item.descricao,
    quantidade: item.quantidade,
    valor_unitario: item.valor_unitario,
    valor_total: Number((item.quantidade * item.valor_unitario).toFixed(2)),
  })
  if (error) throw error
}

export async function alterarQuantidadeDoItem(
  itemId: string,
  quantidade: number,
  valorUnitario: number,
): Promise<void> {
  const { error } = await supabase
    .from('os_itens')
    .update({
      quantidade,
      valor_total: Number((quantidade * valorUnitario).toFixed(2)),
    })
    .eq('id', itemId)
  if (error) throw error
}

export async function removerItemDaOs(itemId: string): Promise<void> {
  const { error } = await supabase.from('os_itens').delete().eq('id', itemId)
  if (error) throw error
}

/**
 * Aplica no banco a diferença entre a lista que estava na tela e a que ficou.
 *
 * A tela edita uma cópia; aqui vira insert, update e delete. A chave do item em
 * edição é o id da linha quando ela já existe, e um valor aleatório quando é
 * novo — é assim que se sabe quem é quem sem mandar tudo de volta.
 *
 * O total não é enviado: o gatilho do banco recalcula (0026).
 */
export async function sincronizarItensDaOs(
  ordemId: string,
  anteriores: OsItem[],
  novos: Array<{
    chave: string
    tipo: 'produto' | 'servico' | 'avulso'
    produto_id: string | null
    servico_id: string | null
    descricao: string
    quantidade: number
    valor_unitario: number
  }>,
): Promise<void> {
  const porChave = new Map(novos.map((i) => [i.chave, i]))

  for (const antigo of anteriores) {
    const atual = porChave.get(antigo.id)
    if (!atual) {
      await removerItemDaOs(antigo.id)
      continue
    }
    const mudou =
      Number(antigo.quantidade) !== atual.quantidade ||
      Number(antigo.valor_unitario) !== atual.valor_unitario
    if (mudou) {
      await alterarQuantidadeDoItem(antigo.id, atual.quantidade, atual.valor_unitario)
    }
  }

  const existentes = new Set(anteriores.map((i) => i.id))
  for (const item of novos) {
    if (existentes.has(item.chave)) continue
    await adicionarItemNaOs(ordemId, item)
  }
}

export interface FaltaDeEstoque {
  produto_id: string
  nome: string
  unidade: string
  necessario: number
  em_estoque: number
  falta: number
}

/** O que falta para finalizar, para a tela perguntar antes de o banco recusar. */
export async function faltasParaFinalizar(ordemId: string): Promise<FaltaDeEstoque[]> {
  const { data, error } = await supabase.rpc('faltas_para_finalizar_os', {
    p_ordem_servico_id: ordemId,
  })
  if (error) throw error
  return (data ?? []) as FaltaDeEstoque[]
}

export async function finalizarOs(ordemId: string, permitirNegativo = false): Promise<void> {
  const { error } = await supabase.rpc('finalizar_os', {
    p_ordem_servico_id: ordemId,
    p_permitir_negativo: permitirNegativo,
  })
  if (error) throw error
}

export async function cancelarOs(ordemId: string, motivo: string | null): Promise<void> {
  const { error } = await supabase.rpc('cancelar_os', {
    p_ordem_servico_id: ordemId,
    p_motivo: motivo,
  })
  if (error) throw error
}
