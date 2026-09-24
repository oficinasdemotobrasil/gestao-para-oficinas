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
/**
 * Na ordem do enum, do mais tranquilo ao mais grave (migration 0043).
 *
 * 'teste', 'atrasada' e 'bloqueada' são CALCULADAS a partir das datas e só
 * aparecem em `minha_situacao()`. A coluna `oficinas.status` guarda apenas o
 * que um humano decidiu: 'ativa', 'suspensa' ou 'cancelada'.
 */
export type StatusOficina =
  | 'teste'
  | 'ativa'
  | 'atrasada'
  | 'bloqueada'
  | 'suspensa'
  | 'cancelada'
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
  /** Logo em ~512px, para o PDF. Nulo enquanto a oficina não subir nenhum. */
  logo_url: string | null
  /** Logo em ~128px, para o menu e a tela de entrar (migration 0041). */
  logo_miniatura_url: string | null
  /** Cor da marca, hexadecimal minúsculo. Padrão: o amarelo do produto. */
  cor_primaria: string
  chave_pix: string | null
  tipo_chave_pix: TipoChavePix | null
  plano: PlanoOficina
  status: StatusOficina
  criado_em: string
  atualizado_em: string
  /** Exigida pelo BR Code do PIX (campo 60). */
  cidade: string | null
  /** Categorias de despesa que a oficina usa nas contas a pagar. */
  categorias_despesa: string[]
  /** Percentual padrão de comissão dos indicadores (0065). */
  comissao_indicador_percentual: number
  /** Depois de quantos dias sem serviço concluído o cliente entra em "sumidos". */
  dias_para_cliente_inativo: number
  /** Até quando o acesso está garantido. Nulo é sem prazo (migration 0044). */
  acesso_ate: string | null
  /** Fim dos dias de teste, para a tela dizer quantos faltam. */
  teste_ate: string | null
  /**
   * Certificado digital A1 (migration 0059). O ARQUIVO nunca é guardado —
   * ele assina documento legal em nome da empresa. Só fica o que a tela
   * precisa: de quem é, e até quando vale.
   */
  certificado_cnpj: string | null
  certificado_titular: string | null
  certificado_valido_ate: string | null
  certificado_configurado_em: string | null
  /** Quando a exclusão pode ser efetivada. Nulo é sem pedido (migration 0045). */
  excluir_em: string | null
  exclusao_pedida_em: string | null
  motivo_da_saida: string | null
  /** A oficina dispensou a lista de primeiros passos (migration 0049). */
  primeiros_passos_ocultos: boolean
  /** Quando os termos foram aceitos, e qual versão (migration 0052). */
  termos_aceitos_em: string | null
  termos_versao: string | null
}

/** Catálogo de planos: a mesma lista para todas as oficinas (migration 0042). */
export type Plano = {
  id: PlanoOficina
  nome: string
  descricao: string | null
  preco_mensal: number
  /** Nulo é sem limite. */
  limite_colaboradores: number | null
  limite_os_mes: number | null
  tem_financeiro: boolean
  ordem: number
  ativo: boolean
  /** O que a oficina lê no cartão do plano, na ordem (migration 0051). */
  beneficios: string[]
  /** Duração do teste, em dias. Nulo nos planos pagos. */
  dias_de_teste: number | null
  atualizado_em: string
}

/** O contrato da oficina. Escrito por quem cobra; o app só lê (migration 0044). */
export type Assinatura = {
  id: string
  oficina_id: string
  plano: PlanoOficina
  situacao: 'ativa' | 'encerrada'
  inicio: string
  proxima_cobranca: string | null
  cancelada_em: string | null
  motivo_cancelamento: string | null
  motivo_detalhe: string | null
  id_externo_cliente: string | null
  id_externo_assinatura: string | null
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
  /** Opcional (0061): serve para lembrar do cliente no aniversário. */
  data_nascimento: string | null
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
  /** Classificação fiscal, cadastrada uma vez e reaproveitada em toda nota (0058). */
  ncm: string | null
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
  /** Campos fiscais (0058): guardados, não calculados nem validados contra a Sefaz. */
  natureza_operacao: string | null
  cfop: string | null
  base_calculo_icms: number | null
  valor_icms: number | null
  /** Raro numa entrada de mercadoria — existe para nota de serviço tomado de terceiro. */
  valor_iss: number | null
  /** Os 44 dígitos da nota — digitados, colados ou lidos de um QR code do DANFE. */
  chave_acesso: string | null
  status: StatusNota
  cancelada_em: string | null
  cancelada_por: string | null
  criado_em: string
  atualizado_em: string
}

/**
 * A saída — venda de produto e/ou serviço. Formaliza uma OS já finalizada
 * (`ordem_servico_id` presente, estoque já baixou lá) ou é venda de balcão
 * (`ordem_servico_id` nulo, estoque baixa agora). O tipo do documento (NFe,
 * NFSe ou misto) não é uma coluna: é derivado dos itens.
 */
type NotaFiscalSaida = {
  id: string
  oficina_id: string
  /** Pode ficar em branco: registro interno, antes de a oficina emitir de verdade. */
  numero: string | null
  cliente_id: string | null
  ordem_servico_id: string | null
  natureza_operacao: string | null
  cfop: string | null
  base_calculo_icms: number | null
  valor_icms: number | null
  base_calculo_iss: number | null
  valor_iss: number | null
  valor_total: number
  status: StatusNota
  cancelada_em: string | null
  cancelada_por: string | null
  criado_em: string
  atualizado_em: string
}

/** A linha gravada de uma nota de saída. */
type ItemNfSaida = {
  id: string
  oficina_id: string
  nota_fiscal_saida_id: string
  tipo: 'produto' | 'servico'
  produto_id: string | null
  servico_id: string | null
  descricao: string
  quantidade: number
  valor_unitario: number
  valor_total: number
  /** Nulo herda o NCM do cadastro do produto — não precisa redigitar em toda nota. */
  ncm: string | null
  cfop_item: string | null
  criado_em: string
}

type MovimentacaoEstoque = {
  id: string
  oficina_id: string
  produto_id: string
  tipo: TipoMovimentacao
  quantidade: number
  motivo: string | null
  nota_fiscal_id: string | null
  /** De qual nota de SAÍDA esta baixa veio, quando for venda avulsa (0058). */
  nota_fiscal_saida_id: string | null
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
  indicador_id: string | null
  valor_total: number
  criado_por: string | null
  /** No serviço antigo (0060), é a data em que o serviço aconteceu. */
  criado_em: string
  atualizado_em: string
  /** Preenchida só no serviço antigo: o momento real em que foi lançado. */
  historico_lancado_em: string | null
}

/**
 * Uma lista dentro da ficha: até 50 itens e o total de verdade. A tela mostra
 * os primeiros e abre o resto sem ir ao servidor de novo.
 */
type ListaDaFicha<T> = { total: number; itens: T[] }

type OrcamentoNaFicha = {
  id: string
  numero: number
  status: StatusOrcamento
  valor: number
  data: string
  /** Lançado como serviço antigo (0060). */
  historico: boolean
  validade_ate: string | null
}

type OrdemNaFicha = {
  id: string
  numero: number
  status: StatusOS
  valor: number
  data: string
  conclusao: string | null
  garantia_ate: string | null
  historico: boolean
  placa: string | null
  cliente_nome: string | null
  responsavel: string | null
}

type NotaNaFicha = {
  id: string
  numero: string | null
  valor: number
  status: StatusNota
  data: string
  ordem_servico_id: string | null
}

/**
 * Quem manda cliente para a oficina, e ganha por isso (0065). O código é
 * escolhido pelo próprio indicador e é o que o cliente fala no balcão.
 */
type Indicador = {
  id: string
  oficina_id: string
  nome: string
  telefone: string | null
  codigo: string
  /** Nulo usa o percentual da oficina; preenchido, vence o dela. */
  percentual: number | null
  ativo: boolean
  observacoes: string | null
  criado_em: string
  atualizado_em: string
}

type StatusComissao = 'a_pagar' | 'paga' | 'cancelada'

/** Nasce na aprovação do orçamento e é cancelada junto com a OS (0065). */
type Comissao = {
  id: string
  oficina_id: string
  indicador_id: string
  orcamento_id: string
  ordem_servico_id: string | null
  /** O valor do orçamento aprovado, congelado: a OS muda depois. */
  base: number
  /** O percentual daquele dia, congelado pelo mesmo motivo. */
  percentual: number
  valor: number
  status: StatusComissao
  data_pagamento: string | null
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
  /** Preenchida só no serviço antigo (0060): o momento real em que foi lançado. */
  historico_lancado_em: string | null
}

/** Formas de pagamento aceitas nas duas pontas do financeiro. */
export type FormaPagamento =
  | 'dinheiro'
  | 'pix'
  | 'debito'
  | 'credito'
  | 'transferencia'
  | 'prazo'

type ContaReceber = {
  id: string
  oficina_id: string
  ordem_servico_id: string | null
  cliente_id: string | null
  descricao: string
  valor: number
  /** Quanto já entrou. Menor que valor = parcial, e a conta continua aberta. */
  valor_recebido: number
  vencimento: string
  data_pagamento: string | null
  forma_pagamento: FormaPagamento | null
  /** Nulos quando a cobrança é à vista. */
  parcela: number | null
  total_parcelas: number | null
  /** De qual nota de saída esta cobrança nasceu. Nula em cobrança avulsa (0058). */
  nota_fiscal_saida_id: string | null
  status: StatusConta
  criado_em: string
  atualizado_em: string
}

type ContaPagar = {
  id: string
  oficina_id: string
  fornecedor: string | null
  descricao: string
  categoria: string | null
  valor: number
  vencimento: string
  data_pagamento: string | null
  forma_pagamento: FormaPagamento | null
  /** De qual nota de entrada esta parcela nasceu. Nula em despesa lançada direto (0058). */
  nota_fiscal_entrada_id: string | null
  /** Nulos quando a compra é à vista (uma parcela só). */
  parcela: number | null
  total_parcelas: number | null
  status: StatusConta
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
/** O que a RPC de saída recebe — sem id, oficina_id, valor_total nem criado_em: o banco calcula. */
type ItemNfSaidaPayload = {
  tipo: 'produto' | 'servico'
  produto_id: string | null
  servico_id: string | null
  descricao: string
  quantidade: number
  valor_unitario: number
  /** Nulo herda o NCM do cadastro do produto. */
  ncm: string | null
  cfop_item: string | null
}

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
      notas_fiscais_saida: Tabela<NotaFiscalSaida>
      itens_nf_saida: Tabela<ItemNfSaida>
      movimentacoes_estoque: Tabela<MovimentacaoEstoque>
      indicadores: Tabela<Indicador>
      comissoes: Tabela<Comissao>
      orcamentos: TabelaNumerada<Orcamento>
      orcamento_itens: Tabela<OrcamentoItem>
      ordens_servico: TabelaNumerada<OrdemServico>
      os_itens: Tabela<OsItem>
      os_status_historico: Tabela<OsStatusHistorico>
      contas_receber: Tabela<ContaReceber>
      contas_pagar: Tabela<ContaPagar>
      /* Catálogo, sem oficina_id: a mesma lista para todo mundo. Só leitura
         pelo app — mudar plano é operação de plataforma. */
      planos: { Row: Plano; Insert: never; Update: never; Relationships: [] }
      assinaturas: { Row: Assinatura; Insert: never; Update: never; Relationships: [] }
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
          p_natureza_operacao?: string | null
          p_cfop?: string | null
          p_base_calculo_icms?: number | null
          p_valor_icms?: number | null
          p_valor_iss?: number | null
          p_chave_acesso?: string | null
          /** Financeiro: toda nota gera ao menos uma parcela em Contas a Pagar (0058). */
          p_parcelas?: number
          p_primeiro_vencimento?: string | null
          p_categoria?: string | null
          p_forma_pagamento?: string | null
          p_pago_agora?: boolean
        }
        Returns: string
      }
      cancelar_nota: { Args: { p_nota_id: string }; Returns: undefined }
      salvar_nota_saida_com_itens: {
        Args: {
          p_numero: string | null
          p_cliente_id: string | null
          /** Presente = a OS já baixou o estoque na finalização; aqui só formaliza. */
          p_ordem_servico_id: string | null
          p_natureza_operacao: string | null
          p_cfop: string | null
          p_base_calculo_icms: number | null
          p_valor_icms: number | null
          p_base_calculo_iss: number | null
          p_valor_iss: number | null
          p_itens: ItemNfSaidaPayload[]
          p_parcelas?: number
          p_primeiro_vencimento?: string
          p_forma_pagamento?: string | null
        }
        Returns: string
      }
      cancelar_nota_saida: { Args: { p_nota_id: string }; Returns: undefined }
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
          /** Quem indicou o cliente (0065). A comissão nasce na aprovação. */
          p_indicador_id?: string | null
        }
        Returns: string
      }
      lancar_servico_antigo: {
        Args: {
          p_cliente_id: string
          p_moto_id: string
          p_km_registrado: number | null
          p_garantia_dias: number
          p_observacoes: string | null
          p_desconto: number
          p_desconto_percentual: number | null
          p_itens: ItemOrcamento[]
          /** aaaa-mm-dd */
          p_data_servico: string
          p_data_pagamento: string | null
          p_forma_pagamento: FormaPagamento | null
        }
        /** O id do orçamento criado. */
        Returns: string
      }
      /**
       * A ficha completa (0064). Roda como dona do banco: é assim que o
       * vendedor enxerga a dívida daquele cliente sem que o Financeiro se abra
       * para ele. O mecânico não chama — a função recusa.
       */
      ficha_do_cliente: {
        Args: { p_cliente: string }
        Returns: {
          resumo: {
            servicos: number
            total_gasto: number
            ultimo_servico: string | null
            em_andamento: number
          }
          motos: Array<{
            id: string
            placa: string
            marca: string | null
            modelo: string | null
            ano: number | null
            km_atual: number
            ultimo_servico: string | null
          }>
          orcamentos: ListaDaFicha<OrcamentoNaFicha>
          ordens: ListaDaFicha<OrdemNaFicha>
          notas: ListaDaFicha<NotaNaFicha>
          /** Nulo no plano sem financeiro: ausência de direito ao dado, não de dado. */
          financeiro: {
            em_aberto: number
            em_atraso: number
            recebido: number
            contas: Array<{
              id: string
              descricao: string
              valor: number
              valor_recebido: number
              vencimento: string
              status: StatusConta
            }>
          } | null
          cliente: { desde: string; data_nascimento: string | null }
        }
      }
      ficha_da_moto: {
        Args: { p_moto: string }
        Returns: {
          resumo: {
            servicos: number
            total_gasto: number
            ultimo_servico: string | null
            em_andamento: number
            /** A garantia que ainda vale hoje, se houver. */
            garantia_ate: string | null
          }
          orcamentos: ListaDaFicha<OrcamentoNaFicha>
          ordens: ListaDaFicha<OrdemNaFicha>
          notas: ListaDaFicha<NotaNaFicha>
          pecas: Array<{
            descricao: string
            quantidade: number
            ultima_vez: string | null
            vezes: number
          }>
          proprietarios: Array<{
            cliente_id: string
            nome: string
            telefone: string | null
            desde: string
            ate: string | null
          }>
        }
      }
      indicador_por_codigo: {
        Args: { p_codigo: string }
        Returns: Array<{
          id: string
          nome: string
          codigo: string
          /** Já resolvido: o do indicador, ou o da oficina. */
          percentual: number
          ativo: boolean
        }>
      }
      pagar_comissao: { Args: { p_comissao_id: string; p_data?: string }; Returns: Comissao }
      desfazer_pagamento_da_comissao: { Args: { p_comissao_id: string }; Returns: Comissao }
      indicadores_com_comissoes: {
        Args: Record<string, never>
        Returns: {
          percentual_padrao: number
          indicadores: Array<{
            id: string
            nome: string
            codigo: string
            telefone: string | null
            ativo: boolean
            percentual: number | null
            percentual_efetivo: number
            indicacoes: number
            a_pagar: number
            pago: number
            /** Quanto de serviço aprovado veio dele. */
            gerado: number
          }>
        }
      }
      /** A busca do balcão (0062): placa, cliente e OS numa chamada só. */
      busca_geral: {
        Args: { p_termo: string }
        Returns: {
          clientes: Array<{
            id: string
            nome: string
            telefone: string | null
            motos: Array<{ id: string; placa: string; marca: string | null; modelo: string | null }>
            em_aberto: number
          }>
          motos: Array<{
            id: string
            placa: string
            marca: string | null
            modelo: string | null
            ano: number | null
            km_atual: number
            dono_id: string | null
            dono_nome: string | null
            dono_telefone: string | null
            ultimo_servico: string | null
            servicos_abertos: number
          }>
          ordens: Array<{
            id: string
            numero: number
            status: StatusOS
            data: string
            valor: number
            placa: string | null
            cliente_nome: string | null
          }>
        }
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
      criar_cobranca_da_os: {
        Args: {
          p_ordem_servico_id: string
          p_parcelas: number
          p_primeiro_vencimento: string
          p_forma_pagamento: string | null
        }
        Returns: number
      }
      receber_conta: {
        Args: {
          p_conta_id: string
          p_valor: number | null
          p_data: string
          p_forma_pagamento: string | null
        }
        Returns: ContaReceber
      }
      cancelar_conta_receber: { Args: { p_conta_id: string }; Returns: undefined }
      lancar_conta_a_pagar: {
        Args: {
          p_descricao: string
          p_valor: number
          p_vencimento: string
          p_fornecedor: string | null
          p_categoria: string | null
          p_repetir_meses: number
        }
        Returns: number
      }
      pagar_conta: {
        Args: { p_conta_id: string; p_data: string; p_forma_pagamento: string | null }
        Returns: ContaPagar
      }
      painel: {
        Args: { p_de: string; p_ate: string }
        Returns: {
          de: string
          ate: string
          orcamentos: {
            emitidos: number
            aprovados: number
            recusados: number
            em_aberto: number
            valor_aprovado: number
            ticket_medio: number
            conversao: number | null
          }
          servicos: {
            abertas: number
            em_andamento: number
            aguardando_conferencia: number
            finalizadas: number
            canceladas: number
            valor_finalizado: number
            horas_medias: number
          }
          ranking: Array<{ nome: string; ordens: number; minutos: number }>
          /**
           * Nulo quando o plano da oficina não inclui o financeiro
           * (migration 0039). O tipo dizia que era sempre um objeto, e por
           * isso o compilador deixou passar um painel que quebrava para toda
           * oficina em teste ou no Operacional.
           */
          financeiro: {
            a_receber: number
            em_atraso: number
            recebido: number
            a_pagar: number
            pago: number
          } | null
          evolucao: Array<{ dia: string; valor: number }>
          /**
           * Serviço antigo que ficou FORA do período escolhido (0061). Existe
           * porque serviço antigo é sempre de antes de a oficina entrar no
           * sistema: no período padrão, que é o mês, ele nunca apareceria.
           */
          historico_fora_do_periodo: {
            quantidade: number
            valor: number
            primeiro_dia: string | null
            ultimo_dia: string | null
          }
          produtos_para_repor: number
        }
      }
      clientes_inativos: {
        Args: { p_dias: number | null }
        Returns: Array<{
          cliente_id: string
          nome: string
          telefone: string | null
          ultima_visita: string
          dias_sem_voltar: number
          placa: string | null
          marca: string | null
          modelo: string | null
          ultimo_servico: string | null
        }>
      }
      historico_da_placa: {
        Args: { p_moto_id: string }
        Returns: Array<{
          id: string
          numero: number
          data: string
          km: number | null
          valor: number
          dono_na_epoca: string | null
          servicos: string[]
          pecas: string[]
        }>
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
      /** A situação de hoje, calculada das datas (migration 0044). */
      minha_situacao: { Args: Record<string, never>; Returns: StatusOficina }
      /** Tudo o que é da oficina, em qualquer situação (migration 0045). */
      exportar_dados_da_oficina: { Args: Record<string, never>; Returns: Record<string, unknown> }
      /** Marca a data. Não apaga nada. Devolve quando a exclusão pode ocorrer. */
      pedir_encerramento_da_conta: { Args: { p_motivo: string | null }; Returns: string }
      desistir_do_encerramento: { Args: Record<string, never>; Returns: void }
      /** O que já foi feito nos primeiros passos, calculado (migration 0049). */
      primeiros_passos: { Args: Record<string, never>; Returns: Record<string, boolean> }
      carregar_exemplos: {
        Args: Record<string, never>
        Returns: { servicos: number; produtos: number }
      }
      apagar_exemplos: {
        Args: Record<string, never>
        Returns: { servicos: number; produtos: number; mantidos_por_uso: number }
      }
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
  NotaFiscalSaida,
  ItemNfSaida,
  MovimentacaoEstoque,
  MovimentacaoVisivel,
  Indicador,
  Comissao,
  StatusComissao,
  Orcamento,
  OrcamentoItem,
  OrdemServico,
  OsStatusHistorico,
  ContaReceber,
  ContaPagar,
  OsItem,
  ItemOrcamento,
  ItemNota,
  ItemNfSaidaPayload,
}
