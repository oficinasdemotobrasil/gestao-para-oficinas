import { supabase } from '@/lib/supabase'
import { limparBusca } from '@/lib/erros'
import { normalizarPlaca } from '@/lib/formato'
import type {
  Cliente,
  Moto,
  Orcamento,
  // A linha gravada do item, não o formato que a função do banco recebe.
  OrcamentoItem,
  StatusOrcamento,
  TipoItem,
} from '@/tipos/banco'

/** Orçamento com o que a lista precisa mostrar sem abrir cada um. */
export interface OrcamentoNaLista extends Orcamento {
  cliente: Pick<Cliente, 'id' | 'nome' | 'telefone'> | null
  moto: Pick<Moto, 'id' | 'placa' | 'marca' | 'modelo'> | null
}

/**
 * "Expirado" não é gravado no banco: é o status somado ao calendário.
 *
 * Gravar exigiria alguém rodando uma tarefa todo dia para virar a chave, e um
 * dia sem rodar mostraria orçamento vencido como válido. Calculando na leitura,
 * a verdade não depende de nada ter rodado.
 */
export function statusEfetivo(orcamento: {
  status: StatusOrcamento
  validade_ate: string | null
}): StatusOrcamento {
  if (orcamento.status !== 'rascunho' && orcamento.status !== 'enviado') {
    return orcamento.status
  }
  if (!orcamento.validade_ate) return orcamento.status
  const hoje = new Date().toISOString().slice(0, 10)
  return orcamento.validade_ate < hoje ? 'expirado' : orcamento.status
}

const SELECAO_LISTA = `
  *,
  cliente:clientes(id, nome, telefone),
  moto:motos(id, placa, marca, modelo)
`

export async function listarOrcamentos(opcoes: {
  busca: string
  status: StatusOrcamento | 'todos'
}): Promise<OrcamentoNaLista[]> {
  let consulta = supabase
    .from('orcamentos')
    .select(SELECAO_LISTA)
    .order('numero', { ascending: false })
    .limit(200)

  // 'expirado' não existe no banco: filtra depois de calcular.
  if (opcoes.status !== 'todos' && opcoes.status !== 'expirado') {
    consulta = consulta.eq('status', opcoes.status)
  }

  const termo = limparBusca(opcoes.busca)
  if (termo) {
    const numero = Number(termo.replace(/\D/g, ''))
    if (Number.isFinite(numero) && numero > 0 && /^\d+$/.test(termo.trim())) {
      consulta = consulta.eq('numero', numero)
    }
  }

  const { data, error } = await consulta
  if (error) throw error

  let lista = (data ?? []) as unknown as OrcamentoNaLista[]

  // Busca por nome do cliente e por placa acontece aqui: são duas tabelas
  // diferentes, e o filtro do PostgREST não cruza as duas numa consulta só.
  if (termo && !/^\d+$/.test(termo.trim())) {
    const alvo = termo.toLowerCase()
    const placa = normalizarPlaca(termo)
    lista = lista.filter(
      (o) =>
        o.cliente?.nome.toLowerCase().includes(alvo) ||
        (placa && o.moto?.placa.includes(placa)),
    )
  }

  if (opcoes.status === 'expirado') {
    lista = lista.filter((o) => statusEfetivo(o) === 'expirado')
  }

  return lista
}

export interface OrcamentoCompleto extends OrcamentoNaLista {
  itens: OrcamentoItem[]
}

export async function obterOrcamento(id: string): Promise<OrcamentoCompleto | null> {
  const { data, error } = await supabase
    .from('orcamentos')
    .select(`${SELECAO_LISTA}, itens:orcamento_itens(*)`)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const completo = data as unknown as OrcamentoCompleto
  completo.itens = [...(completo.itens ?? [])].sort((a, b) =>
    a.criado_em.localeCompare(b.criado_em),
  )
  return completo
}

/** Um item enquanto está sendo montado na tela, antes de virar linha no banco. */
export interface ItemEmEdicao {
  /** Identidade só na tela, para o React saber quem é quem. */
  chave: string
  tipo: TipoItem
  produto_id: string | null
  servico_id: string | null
  descricao: string
  quantidade: number
  valor_unitario: number
}

export interface DadosOrcamento {
  id: string | null
  cliente_id: string
  moto_id: string
  km_registrado: number | null
  validade_dias: number
  garantia_dias: number
  observacoes: string | null
  desconto: number
  desconto_percentual: number | null
  itens: ItemEmEdicao[]
}

/**
 * Grava o orçamento e os itens numa transação só, pela função do banco.
 *
 * Também evita a armadilha da inserção em lote pelo PostgREST, em que a linha
 * sem uma coluna recebe NULL e derruba o lote inteiro.
 */
export async function salvarOrcamento(dados: DadosOrcamento): Promise<string> {
  const { data, error } = await supabase.rpc('salvar_orcamento_com_itens', {
    p_orcamento_id: dados.id,
    p_cliente_id: dados.cliente_id,
    p_moto_id: dados.moto_id,
    p_km_registrado: dados.km_registrado,
    p_validade_dias: dados.validade_dias,
    p_garantia_dias: dados.garantia_dias,
    p_observacoes: dados.observacoes,
    p_desconto: dados.desconto,
    p_desconto_percentual: dados.desconto_percentual,
    p_itens: dados.itens.map((i) => ({
      tipo: i.tipo,
      produto_id: i.produto_id,
      servico_id: i.servico_id,
      descricao: i.descricao,
      quantidade: i.quantidade,
      valor_unitario: i.valor_unitario,
    })),
  })
  if (error) throw error
  return data as string
}

export async function duplicarOrcamento(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('duplicar_orcamento', { p_orcamento_id: id })
  if (error) throw error
  return data as string
}

export async function aprovarOrcamento(id: string, responsavelId: string): Promise<string> {
  const { data, error } = await supabase.rpc('aprovar_orcamento', {
    p_orcamento_id: id,
    p_responsavel_id: responsavelId,
  })
  if (error) throw error
  return data as string
}

export async function recusarOrcamento(id: string, motivo: string | null): Promise<void> {
  const { error } = await supabase.rpc('recusar_orcamento', {
    p_orcamento_id: id,
    p_motivo: motivo,
  })
  if (error) throw error
}

/**
 * Pede ao Gemini um texto comercial para o campo Observações, a partir dos
 * itens que já estão na tela — funciona tanto num orçamento novo (ainda não
 * salvo) quanto num em edição. Uso opcional: nunca é chamado sozinho.
 */
export async function gerarTextoComercial(dados: {
  itens: Array<{ descricao: string; tipo: string; quantidade: number; valor_unitario: number }>
  desconto: number
  total: number
}): Promise<string> {
  const { data, error } = await supabase.functions.invoke('gerar-texto-orcamento', {
    body: dados,
  })

  if (error) {
    let mensagem = 'Não foi possível gerar o texto agora.'
    const resposta = (error as { context?: Response }).context
    if (resposta && typeof resposta.json === 'function') {
      try {
        const corpo = await resposta.json()
        if (corpo?.erro) mensagem = corpo.erro
      } catch {
        // mantém a mensagem genérica se o corpo não for JSON
      }
    }
    throw new Error(mensagem)
  }
  if (data?.erro) throw new Error(data.erro)
  return data.texto as string
}

/** Marca como enviado ao mandar pelo WhatsApp ou copiar o texto. */
export async function marcarComoEnviado(id: string): Promise<void> {
  const { error } = await supabase
    .from('orcamentos')
    .update({ status: 'enviado' })
    .eq('id', id)
    .eq('status', 'rascunho')
  if (error) throw error
}
