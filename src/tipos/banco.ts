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
export type TipoItem = 'produto' | 'servico'
export type StatusOrcamento = 'rascunho' | 'enviado' | 'aprovado' | 'recusado' | 'expirado'
export type StatusOS =
  | 'aberta'
  | 'em_andamento'
  | 'pausada'
  | 'finalizada'
  | 'entregue'
  | 'cancelada'
export type TipoMovimentacao = 'entrada' | 'saida' | 'ajuste'
export type StatusConta = 'aberta' | 'paga' | 'atrasada' | 'cancelada'

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

type OrdemServico = {
  id: string
  oficina_id: string
  orcamento_id: string | null
  numero: number
  cliente_id: string
  moto_id: string
  mecanico_id: string | null
  status: StatusOS
  km_entrada: number | null
  data_abertura: string
  data_conclusao: string | null
  garantia_ate: string | null
  observacoes: string | null
  criado_em: string
  atualizado_em: string
}

/** Campos que o banco preenche sozinho e que nunca são enviados na inserção. */
type Gerados = 'id' | 'criado_em' | 'atualizado_em'

/** oficina_id tem default no banco (a oficina do usuário logado): opcional aqui. */
type ParaInserir<T extends { oficina_id: string }> = Omit<T, Gerados> & {
  id?: string
  oficina_id?: string
}

type Tabela<Linha extends { oficina_id: string }> = {
  Row: Linha
  Insert: ParaInserir<Linha>
  Update: Partial<ParaInserir<Linha>>
  Relationships: []
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
      ordens_servico: Tabela<OrdemServico>
    }
    Views: {
      vw_produtos: {
        Row: ProdutoSemCusto
        Relationships: []
      }
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
  OrdemServico,
}
