/**
 * Tipos do banco, escritos à mão a partir das migrations em /supabase/migrations.
 *
 * Assim que o projeto estiver ligado à CLI do Supabase, gere este arquivo em vez
 * de editá-lo, para ele nunca sair de sincronia com o banco:
 *
 *   npx supabase link --project-ref ilkwxilkwjinuktgzlaq
 *   npm run tipos:banco
 */

export type PerfilUsuario = 'admin' | 'vendedor' | 'mecanico'
export type PlanoOficina = 'gratuito' | 'essencial' | 'completo'
export type StatusOficina = 'ativa' | 'suspensa' | 'cancelada'
export type TipoChavePix = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria'
/** 'avulso' é o item digitado na hora, sem produto nem serviço (migration 0016). */
export type TipoItem = 'produto' | 'servico' | 'avulso'
export type StatusOrcamento = 'rascunho' | 'enviado' | 'aprovado' | 'recusado' | 'expirado'
export type StatusOS =
  | 'aberta'
  | 'em_andamento'
  | 'pausada'
  /** O mecânico terminou e avisou. Quem confere é que finaliza (0027). */
  | 'aguardando_conferencia'
  | 'finalizada'
  | 'entregue'
  | 'cancelada'
export type TipoMovimentacao = 'entrada' | 'saida' | 'ajuste'
export type StatusConta = 'aberta' | 'paga' | 'atrasada' | 'cancelada'
export type StatusNota = 'lancada' | 'cancelada'

type Oficina = {
  id: string
  nome: string
  cnpj: string | null
  telefone: string | null
  endereco: string | null
  logo_url: string | null
  cor_primaria: string
  chave_pix: string | null
  tipo_chave_pix: TipoChavePix | null
  plano: PlanoOficina
  status: StatusOficina
  criado_em: string
  atualizado_em: string
}

type Usuario = {
  id: string
  oficina_id: string
  nome: string
  email: string
  telefone: string | null
  perfil: PerfilUsuario
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

type Cliente = {
  id: string
  oficina_id: string
  nome: string
  telefone: string | null
  email: string | null
  cpf_cnpj: string | null
  observacoes: string | null
  criado_em: string
  atualizado_em: string
}

type Moto = {
  id: string
  oficina_id: string
  placa: string
  marca: string | null
  modelo: string | null
  ano: number | null
  cor: string | null
  chassi: string | null
  km_atual: number
  criado_em: string
  atualizado_em: string
}

type MotoProprietario = {
  id: string
  oficina_id: string
  moto_id: string
  cliente_id: string
  data_inicio: string
  data_fim: string | null
  criado_em: string
  atualizado_em: string
}

type Produto = {
  id: string
  oficina_id: string
  codigo: string | null
  nome: string
  descricao: string | null
  unidade: string
  preco_custo: number
  preco_venda: number
  estoque_atual: number
  estoque_minimo: number
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

/** O mesmo produto sem preco_custo: é o que o vendedor enxerga. */
type ProdutoSemCusto = Omit<Produto, 'preco_custo'>

type Servico = {
  id: string
  oficina_id: string
  nome: string
  descricao: string | null
  preco: number
  tempo_estimado_minutos: number | null
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

type NotaFiscalEntrada = {
  id: string
  oficina_id: string
  numero: string
  fornecedor: string | null
  data_emissao: string | null
  valor_total: number
  arquivo_url: string | null
  status: StatusNota
  cancelada_em: string | null
  cancelada_por: string | null
  criado_em: string
  atualizado_em: string
}

type MovimentacaoEstoque = {
  id: string
  oficina_id: string
  produto_id: string
  tipo: TipoMovimentacao
  quantidade: number
  motivo: string | null
  nota_fiscal_id: string | null
  ordem_servico_id: string | null
  usuario_id: string | null
  /** Preço de custo: só o admin lê a tabela. Ver vw_movimentacoes. */
  custo_unitario: number | null
  criado_em: string
}

/** Extrato sem custo, para admin e vendedor (migration 0023). */
type MovimentacaoVisivel = {
  id: string
  oficina_id: string
  produto_id: string
  produto_nome: string
  produto_unidade: string
  tipo: TipoMovimentacao
  quantidade: number
  motivo: string | null
  nota_fiscal_id: string | null
  ordem_servico_id: string | null
  usuario_id: string | null
  usuario_nome: string | null
  criado_em: string
}

type Orcamento = {
  id: string
  oficina_id: string
  numero: number
  cliente_id: string
  moto_id: string
  status: StatusOrcamento
  km_registrado: number | null
  validade_dias: number
  validade_ate: string | null
  garantia_dias: number
  observacoes: string | null
  desconto: number
  desconto_percentual: number | null
  motivo_recusa: string | null
  valor_total: number
  criado_por: string | null
  criado_em: string
  atualizado_em: string
}

type ItemDeDocumento = {
  id: string
  oficina_id: string
  tipo: TipoItem
  produto_id: string | null
  servico_id: string | null
  descricao: string
  quantidade: number
  valor_unitario: number
  valor_total: number
  criado_em: string
}

type OrcamentoItem = ItemDeDocumento & { orcamento_id: string }
type OsItem = ItemDeDocumento & { ordem_servico_id: string }

type OrdemServico = {
  id: string
  oficina_id: string
  orcamento_id: string | null
  numero: number
  cliente_id: string
  moto_id: string
  /** Qualquer colaborador pode ser o responsável, não só mecânico (0017). */
  responsavel_id: string | null
  status: StatusOS
  /** O número digitado. Em reais ou em porcentagem, conforme desconto_tipo. */
  desconto: number
  desconto_tipo: 'valor' | 'percentual' | null
  /**
   * Valor da ordem, já com o desconto — a fonte de verdade do financeiro.
   * O orçamento de origem é histórico: a OS muda durante o serviço.
   */
  valor_total: number
  km_entrada: number | null
  data_abertura: string
  data_conclusao: string | null
  garantia_ate: string | null
  /** Veio do orçamento: é o texto que o cliente leu. Histórico, não instrução. */
  observacoes: string | null
  /** O que o mecânico escreveu enquanto trabalhava. É o que sai no PDF da OS. */
  observacoes_tecnicas: string | null
  criado_em: string
  atualizado_em: string
}

type OsStatusHistorico = {
  id: string
  oficina_id: string
  ordem_servico_id: string
  de: StatusOS | null
  para: StatusOS
  usuario_id: string | null
  criado_em: string
}

/** Campos que o banco preenche sozinho e que nunca são enviados na inserção. */
type Gerados = 'id' | 'criado_em' | 'atualizado_em'

/**
 * oficina_id tem default no banco — a coluna é preenchida com a oficina do
 * usuário logado — então o app não precisa (nem deve) mandar esse valor.
 */
type ParaInserir<T extends { oficina_id: string }> = Omit<T, Gerados | 'oficina_id'> & {
  id?: string
  oficina_id?: string
}

type Tabela<Linha extends { oficina_id: string }> = {
  Row: Linha
  Insert: ParaInserir<Linha>
  Update: Partial<ParaInserir<Linha>>
  Relationships: []
}

/** O número é preenchido por gatilho, por oficina (migration 0020). */
type TabelaNumerada<Linha extends { oficina_id: string; numero: number }> = {
  Row: Linha
  Insert: Omit<ParaInserir<Linha>, 'numero'> & { numero?: number }
  Update: Partial<ParaInserir<Linha>>
  Relationships: []
}

type ItemOrcamento = { tipo: string; produto_id: string | null; servico_id: string | null; descricao: string; quantidade: number; valor_unitario: number }
type ItemNota = { produto_id: string; quantidade: number; custo_unitario: number | null }

export type Database = {
  public: {
    Tables: {
      oficinas: {
        Row: Oficina
        Insert: Omit<Oficina, Gerados | 'cor_primaria' | 'plano' | 'status'> & {
          id?: string
          cor_primaria?: string
          plano?: PlanoOficina
          status?: StatusOficina
        }
        Update: Partial<Omit<Oficina, Gerados>>
        Relationships: []
      }
      usuarios: Tabela<Usuario>
      clientes: Tabela<Cliente>
      motos: Tabela<Moto>
      moto_proprietarios: Tabela<MotoProprietario>
      produtos: Tabela<Produto>
      servicos: Tabela<Servico>
      notas_fiscais_entrada: Tabela<NotaFiscalEntrada>
      movimentacoes_estoque: Tabela<MovimentacaoEstoque>
      orcamentos: TabelaNumerada<Orcamento>
      orcamento_itens: Tabela<OrcamentoItem>
      ordens_servico: TabelaNumerada<OrdemServico>
      os_itens: Tabela<OsItem>
      os_status_historico: Tabela<OsStatusHistorico>
    }
    Views: {
      vw_produtos: { Row: ProdutoSemCusto; Relationships: [] }
      vw_movimentacoes: { Row: MovimentacaoVisivel; Relationships: [] }
    }
    Functions: {
      criar_moto_com_proprietario: {
        Args: {
          p_cliente_id: string
          p_placa: string
          p_marca?: string | null
          p_modelo?: string | null
          p_ano?: number | null
          p_cor?: string | null
          p_chassi?: string | null
          p_km_atual?: number
        }
        Returns: Moto
      }
      registrar_movimentacao: {
        Args: {
          p_produto_id: string
          p_tipo: TipoMovimentacao
          p_quantidade: number
          p_motivo: string
        }
        Returns: number
      }
      recalcular_estoque: { Args: { p_produto_id: string }; Returns: number }
      salvar_nota_com_itens: {
        Args: {
          p_numero: string
          p_fornecedor: string | null
          p_data_emissao: string | null
          p_valor_total: number
          p_arquivo_url: string | null
          p_itens: ItemNota[]
        }
        Returns: string
      }
      cancelar_nota: { Args: { p_nota_id: string }; Returns: undefined }
      salvar_orcamento_com_itens: {
        Args: {
          p_orcamento_id: string | null
          p_cliente_id: string
          p_moto_id: string
          p_km_registrado: number | null
          p_validade_dias: number
          p_garantia_dias: number
          p_observacoes: string | null
          p_desconto: number
          p_desconto_percentual: number | null
          p_itens: ItemOrcamento[]
        }
        Returns: string
      }
      duplicar_orcamento: { Args: { p_orcamento_id: string }; Returns: string }
      aprovar_orcamento: {
        Args: { p_orcamento_id: string; p_responsavel_id: string }
        Returns: string
      }
      recusar_orcamento: {
        Args: { p_orcamento_id: string; p_motivo: string | null }
        Returns: undefined
      }
      mudar_status_da_os: {
        Args: { p_ordem_servico_id: string; p_status: StatusOS }
        /** { ordem, pausou_a_ordem } — o número da OS que parou, se parou alguma. */
        Returns: { ordem: OrdemServico; pausou_a_ordem: string | null }
      }
      ordens_do_mecanico: {
        Args: Record<string, never>
        Returns: Array<{
          id: string
          numero: number
          status: StatusOS
          data_abertura: string
          km_entrada: number | null
          cliente_nome: string | null
          placa: string | null
          marca: string | null
          modelo: string | null
        }>
      }
      os_do_mecanico: {
        Args: { p_ordem_servico_id: string }
        Returns: {
          id: string
          numero: number
          status: StatusOS
          data_abertura: string
          km_entrada: number | null
          garantia_ate: string | null
          observacoes_tecnicas: string | null
          cliente_nome: string | null
          placa: string | null
          marca: string | null
          modelo: string | null
          itens: Array<{
            id: string
            tipo: TipoItem
            descricao: string
            quantidade: number
            executado_em: string | null
          }>
        }
      }
      marcar_item_executado: {
        Args: { p_item_id: string; p_feito: boolean }
        Returns: undefined
      }
      salvar_observacoes_tecnicas: {
        Args: { p_ordem_servico_id: string; p_texto: string | null }
        Returns: undefined
      }
      tempo_da_os: {
        Args: { p_ordem_servico_id: string }
        Returns: Array<{
          minutos_registrados: number
          rodando_desde: string | null
          quem_esta_com_ela: string | null
          minutos_estimados: number
        }>
      }
      faltas_para_finalizar_os: {
        Args: { p_ordem_servico_id: string }
        Returns: Array<{
          produto_id: string
          nome: string
          unidade: string
          necessario: number
          em_estoque: number
          falta: number
        }>
      }
      finalizar_os: {
        Args: { p_ordem_servico_id: string; p_permitir_negativo: boolean }
        Returns: OrdemServico
      }
      cancelar_os: {
        Args: { p_ordem_servico_id: string; p_motivo: string | null }
        Returns: OrdemServico
      }
      oficina_do_usuario: { Args: Record<string, never>; Returns: string }
      perfil_do_usuario: { Args: Record<string, never>; Returns: PerfilUsuario }
    }
    Enums: {
      perfil_usuario: PerfilUsuario
      plano_oficina: PlanoOficina
      status_oficina: StatusOficina
      tipo_chave_pix: TipoChavePix
      tipo_item: TipoItem
      status_orcamento: StatusOrcamento
      status_os: StatusOS
      tipo_movimentacao: TipoMovimentacao
      status_conta: StatusConta
      status_nota: StatusNota
    }
    CompositeTypes: Record<string, never>
  }
}

export type {
  Oficina,
  Usuario,
  Cliente,
  Moto,
  MotoProprietario,
  Produto,
  ProdutoSemCusto,
  Servico,
  NotaFiscalEntrada,
  MovimentacaoEstoque,
  MovimentacaoVisivel,
  Orcamento,
  OrcamentoItem,
  OrdemServico,
  OsStatusHistorico,
  OsItem,
  ItemOrcamento,
  ItemNota,
}
