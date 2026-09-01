import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Oficina, Usuario } from '@/tipos/banco'

interface Contexto {
  sessao: Session | null
  usuario: Usuario | null
  oficina: Oficina | null
  /** true enquanto ainda não se sabe se há sessão: evita piscar a tela de login. */
  carregando: boolean
  /** Sessão válida no Auth, mas sem linha em public.usuarios. Ver AcessoPendente. */
  semVinculo: boolean
  entrar: (email: string, senha: string) => Promise<void>
  sair: () => Promise<void>
  enviarRecuperacao: (email: string) => Promise<void>
  definirNovaSenha: (senha: string) => Promise<void>
  recarregarUsuario: () => Promise<void>
}

const AuthContexto = createContext<Contexto | null>(null)

/**
 * Traduz os erros do Supabase, que chegam em inglês, para uma frase que diga à
 * pessoa o que fazer. "Invalid login credentials" na tela não ajuda ninguém.
 */
export function traduzirErroAuth(mensagem: string): string {
  const m = mensagem.toLowerCase()
  if (m.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos. Confira e tente de novo.'
  }
  if (m.includes('email not confirmed')) {
    return 'Este e-mail ainda não foi confirmado. Verifique a caixa de entrada.'
  }
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'
  }
  if (m.includes('password should be at least')) {
    return 'A senha precisa ter pelo menos 8 caracteres.'
  }
  if (m.includes('new password should be different')) {
    return 'A nova senha precisa ser diferente da anterior.'
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Sem conexão com a internet. Verifique o sinal e tente de novo.'
  }
  return 'Não foi possível concluir. Tente de novo em instantes.'
}

export function ProvedorAuth({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [oficina, setOficina] = useState<Oficina | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [semVinculo, setSemVinculo] = useState(false)

  /**
   * Busca o cadastro do usuário e a oficina dele. O RLS já garante que só volta
   * a oficina certa — não passamos nenhum filtro de tenant daqui.
   */
  const carregarPerfil = useCallback(async (idUsuario: string) => {
    const { data: linhaUsuario, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', idUsuario)
      .maybeSingle()

    if (error || !linhaUsuario) {
      setUsuario(null)
      setOficina(null)
      setSemVinculo(!error)
      return
    }

    // Colaborador desativado não entra, mesmo com a senha certa.
    if (!linhaUsuario.ativo) {
      await supabase.auth.signOut()
      setUsuario(null)
      setOficina(null)
      throw new Error(
        'Seu acesso foi desativado. Fale com o responsável pela oficina.',
      )
    }

    setUsuario(linhaUsuario)
    setSemVinculo(false)

    const { data: linhaOficina } = await supabase
      .from('oficinas')
      .select('*')
      .eq('id', linhaUsuario.oficina_id)
      .maybeSingle()

    setOficina(linhaOficina ?? null)
  }, [])

  useEffect(() => {
    let ativo = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!ativo) return
      setSessao(data.session)
      if (data.session?.user) {
        await carregarPerfil(data.session.user.id).catch(() => undefined)
      }
      if (ativo) setCarregando(false)
    })

    const { data: assinatura } = supabase.auth.onAuthStateChange(
      async (_evento, novaSessao) => {
        if (!ativo) return
        setSessao(novaSessao)
        if (novaSessao?.user) {
          await carregarPerfil(novaSessao.user.id).catch(() => undefined)
        } else {
          setUsuario(null)
          setOficina(null)
          setSemVinculo(false)
        }
      },
    )

    return () => {
      ativo = false
      assinatura.subscription.unsubscribe()
    }
  }, [carregarPerfil])

  const entrar = useCallback(
    async (email: string, senha: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      })
      if (error) throw new Error(traduzirErroAuth(error.message))
      if (data.user) await carregarPerfil(data.user.id)
    },
    [carregarPerfil],
  )

  const sair = useCallback(async () => {
    await supabase.auth.signOut()
    setUsuario(null)
    setOficina(null)
  }, [])

  const enviarRecuperacao = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    if (error) throw new Error(traduzirErroAuth(error.message))
  }, [])

  const definirNovaSenha = useCallback(async (senha: string) => {
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) throw new Error(traduzirErroAuth(error.message))
  }, [])

  const recarregarUsuario = useCallback(async () => {
    if (sessao?.user) await carregarPerfil(sessao.user.id)
  }, [sessao, carregarPerfil])

  const valor = useMemo<Contexto>(
    () => ({
      sessao,
      usuario,
      oficina,
      carregando,
      semVinculo,
      entrar,
      sair,
      enviarRecuperacao,
      definirNovaSenha,
      recarregarUsuario,
    }),
    [
      sessao,
      usuario,
      oficina,
      carregando,
      semVinculo,
      entrar,
      sair,
      enviarRecuperacao,
      definirNovaSenha,
      recarregarUsuario,
    ],
  )

  return <AuthContexto.Provider value={valor}>{children}</AuthContexto.Provider>
}

export function useAuth(): Contexto {
  const contexto = useContext(AuthContexto)
  if (!contexto) throw new Error('useAuth precisa estar dentro de <ProvedorAuth>.')
  return contexto
}
