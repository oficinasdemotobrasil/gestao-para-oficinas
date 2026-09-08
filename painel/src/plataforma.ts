import { createClient } from '@supabase/supabase-js'

/**
 * O painel fala com o Supabase por duas portas, e a diferença importa.
 *
 * A chave publicável (anon) serve só para o login: ela é feita para viver no
 * navegador e sozinha não enxerga nada, porque o RLS não devolve linha para
 * quem não tem oficina — e quem administra a plataforma, de propósito, não tem.
 *
 * Tudo o que enxerga as oficinas passa pela Edge Function `plataforma`, que roda
 * no servidor com a chave que ignora o RLS. Essa chave nunca entra aqui.
 */
const url = import.meta.env.VITE_SUPABASE_URL
const chavePublica = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !chavePublica) {
  throw new Error(
    'Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY. Veja o README do painel.',
  )
}

export const supabase = createClient(url, chavePublica)

export type Plano = 'gratuito' | 'essencial' | 'completo'

/** O que um humano decidiu. É o que a plataforma escreve. */
export type Situacao = 'ativa' | 'suspensa' | 'cancelada'

/**
 * O que vale hoje, calculado das datas no banco (migration 0044). Pode ser
 * diferente de `status`: uma oficina com status 'ativa' e prazo vencido ontem
 * está em carência, e é isso que precisa aparecer aqui.
 */
export type SituacaoCalculada =
  | 'teste'
  | 'ativa'
  | 'atrasada'
  | 'bloqueada'
  | 'suspensa'
  | 'cancelada'

export interface OficinaNaLista {
  id: string
  nome: string
  cidade: string | null
  plano: Plano
  /** A decisão humana guardada na coluna. */
  status: Situacao
  /** O que vale hoje. É esta que a lista mostra. */
  situacao: SituacaoCalculada
  pessoas: number
  ordens_no_mes: number
  orcamentos_no_mes: number
  ultimo_acesso: string | null
  acesso_ate: string | null
  excluir_em: string | null
  criado_em: string
}

export interface Indicadores {
  total: number
  por_situacao: Partial<Record<SituacaoCalculada, number>>
  receita_mensal: number
  novas_no_mes: number
  encerramentos_no_mes: number
  saindo: number
}

/** Toda chamada à administração passa por aqui, com o token de quem está logado. */
async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('plataforma', { body: corpo })

  if (error) {
    // A função explica no corpo; o erro do invoke só diz o número.
    let mensagem = 'Não foi possível falar com a plataforma.'
    const resposta = (error as { context?: Response }).context
    if (resposta && typeof resposta.json === 'function') {
      try {
        const corpoDoErro = await resposta.json()
        if (corpoDoErro?.erro) mensagem = corpoDoErro.erro
      } catch {
        // mantém a mensagem genérica
      }
    }
    throw new Error(mensagem)
  }
  if ((data as { erro?: string })?.erro) throw new Error((data as { erro: string }).erro)
  return data as T
}

export const listarOficinas = () =>
  chamar<{ oficinas: OficinaNaLista[]; indicadores: Indicadores }>({ acao: 'listar' })

/**
 * Estender teste, liberar bloqueio e dar cortesia são a mesma operação: mudar
 * até quando o acesso vale. Nulo é sem prazo.
 */
export const definirPrazo = (oficina_id: string, acesso_ate: string | null) =>
  chamar<{ ok: true }>({ acao: 'prazo', oficina_id, acesso_ate })

export const criarOficina = (dados: {
  nome: string
  plano: Plano
  admin_nome: string
  admin_email: string
  admin_senha: string
}) => chamar<{ oficina_id: string }>({ acao: 'criar', ...dados })

export const mudarPlano = (oficina_id: string, plano: Plano) =>
  chamar<{ ok: true }>({ acao: 'plano', oficina_id, plano })

export const mudarSituacao = (oficina_id: string, situacao: Situacao) =>
  chamar<{ ok: true }>({ acao: 'situacao', oficina_id, situacao })

export const ROTULO_DO_PLANO: Record<Plano, string> = {
  gratuito: 'Gratuito',
  essencial: 'Essencial',
  completo: 'Completo',
}

export const ROTULO_DA_SITUACAO: Record<Situacao, string> = {
  ativa: 'Ativa',
  suspensa: 'Suspensa',
  cancelada: 'Encerrada',
}

export const ROTULO_CALCULADO: Record<SituacaoCalculada, string> = {
  teste: 'Em teste',
  ativa: 'Ativa',
  atrasada: 'Atrasada',
  bloqueada: 'Bloqueada',
  suspensa: 'Suspensa',
  cancelada: 'Encerrada',
}

/** Verde é o que está bem, âmbar é o que pede atenção, vermelho é o que parou. */
export const TOM_DA_SITUACAO: Record<SituacaoCalculada, string> = {
  teste: 'bg-atencao-fundo text-atencao',
  ativa: 'bg-sucesso-fundo text-sucesso',
  atrasada: 'bg-atencao-fundo text-atencao',
  bloqueada: 'bg-erro-fundo text-erro',
  suspensa: 'bg-erro-fundo text-erro',
  cancelada: 'bg-erro-fundo text-erro',
}

export const dinheiro = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
