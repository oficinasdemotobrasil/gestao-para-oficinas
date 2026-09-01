import { supabase } from '@/lib/supabase'
import type { PerfilUsuario, Usuario } from '@/tipos/banco'

export async function listarColaboradores(): Promise<Usuario[]> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .order('ativo', { ascending: false })
    .order('nome')
  if (error) throw error
  return data ?? []
}

export async function obterColaborador(id: string): Promise<Usuario | null> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export interface NovoColaborador {
  nome: string
  email: string
  senha: string
  telefone: string | null
  perfil: PerfilUsuario
}

/**
 * Criar usuário exige a service_role, que não pode existir no navegador. Por
 * isso esta é a única operação do app que passa por uma Edge Function
 * (supabase/functions/criar-colaborador), rodando no servidor.
 */
export async function criarColaborador(dados: NovoColaborador): Promise<void> {
  const { data, error } = await supabase.functions.invoke('criar-colaborador', {
    body: dados,
  })

  if (error) {
    // A função devolve a explicação no corpo; o erro do invoke só diz o status.
    let mensagem = 'Não foi possível cadastrar o colaborador.'
    const resposta = (error as { context?: Response }).context
    if (resposta && typeof resposta.json === 'function') {
      try {
        const corpo = await resposta.json()
        if (corpo?.erro) mensagem = corpo.erro
      } catch {
        // Mantém a mensagem genérica se o corpo não for JSON.
      }
    }
    throw new Error(mensagem)
  }

  if (data?.erro) throw new Error(data.erro)
}

export interface DadosColaborador {
  nome: string
  telefone: string | null
  perfil: PerfilUsuario
}

export async function atualizarColaborador(id: string, dados: DadosColaborador): Promise<Usuario> {
  const { data, error } = await supabase
    .from('usuarios')
    .update(dados)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/** Colaborador que sai é desativado, não apagado: o histórico dele fica. */
export async function alternarAtivoColaborador(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from('usuarios').update({ ativo }).eq('id', id)
  if (error) throw error
}
