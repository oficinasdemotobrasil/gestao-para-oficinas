import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { acompanharTemaDoAparelho, aplicarCorDaMarca, lembrarMarca } from '../lib/marca'
import type { Oficina, StatusOficina, Usuario } from '@/tipos/banco'

interface Contexto {
  sessao: Session | null
  usuario: Usuario | null
  oficina: Oficina | null
  /**
   * A situação de hoje, calculada no banco a partir das datas — não a coluna
   * `status`, que guarda apenas o que um humano decidiu. Ver migration 0044.
   */
  situacao: StatusOficina | null
  /**
   * O financeiro está aberto para esta oficina?
   *
   * Vem do banco, de `minha_oficina_tem_financeiro`, e não do plano: durante
   * os 7 dias de teste a oficina tem tudo, e foi a tela que deixou de saber
   * disso enquanto o banco já sabia. Uma pergunta, uma resposta, um lugar.
   */
  temFinanceiro: boolean
  /** true enquanto ainda não se sabe se há sessão: evita piscar a tela de login. */
  carregando: boolean
  /** Sessão válida no Auth, mas sem linha em public.usuarios. Ver AcessoPendente. */
  semVinculo: boolean
  /**
   * O cadastro da pessoa já foi buscado no banco para a sessão atual.
   *
   * Existe para separar "ainda não sei" de "procurei e não achou". Sem essa
   * separação, o intervalo entre entrar e o perfil chegar era lido como
   * ausência de vínculo, e a tela de acesso negado piscava em todo login.
   */
  perfilCarregado: boolean
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

/**
 * Troca o valor só se o conteúdo mudou.
 *
 * O cadastro é relido a cada volta para a aba (ver o onAuthStateChange). Cada
 * leitura traz um objeto novo, mesmo idêntico — e as telas que montam um
 * formulário a partir da oficina (Configurações) o recarregam quando ela
 * muda, apagando o que a pessoa estava digitando. Mantendo o mesmo objeto
 * quando nada mudou, só uma mudança de verdade recarrega o formulário.
 */
function seMudou<T>(novo: T | null) {
  return (anterior: T | null) =>
    JSON.stringify(anterior) === JSON.stringify(novo) ? anterior : novo
}

export function ProvedorAuth({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [oficina, setOficina] = useState<Oficina | null>(null)
  const [situacao, setSituacao] = useState<StatusOficina | null>(null)
  const [temFinanceiro, setTemFinanceiro] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [semVinculo, setSemVinculo] = useState(false)
  const [perfilCarregado, setPerfilCarregado] = useState(false)
  /** De quem é o cadastro que está carregado agora. Ver o onAuthStateChange. */
  const perfilDe = useRef<string | null>(null)

  /** Tudo o que veio do cadastro sai junto. Um lugar só, para não esquecer um. */
  const limparPerfil = useCallback(() => {
    perfilDe.current = null
    setUsuario(null)
    setOficina(null)
    setTemFinanceiro(false)
  }, [])

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
      limparPerfil()
      setSemVinculo(!error)
      return
    }

    // Colaborador desativado não entra, mesmo com a senha certa.
    if (!linhaUsuario.ativo) {
      await supabase.auth.signOut()
      limparPerfil()
      throw new Error(
        'Seu acesso foi desativado. Fale com o responsável pela oficina.',
      )
    }

    setUsuario(seMudou<Usuario>(linhaUsuario))
    setSemVinculo(false)
    perfilDe.current = idUsuario

    const { data: linhaOficina } = await supabase
      .from('oficinas')
      .select('*')
      .eq('id', linhaUsuario.oficina_id)
      .maybeSingle()

    setOficina(seMudou<Oficina>(linhaOficina ?? null))

    // A situação vem do banco calculada, e não da coluna: quem só olhasse
    // `status` veria 'ativa' numa oficina cujo prazo venceu ontem.
    const { data: situacaoAtual } = await supabase.rpc('minha_situacao')
    setSituacao((situacaoAtual as StatusOficina | null) ?? null)

    /*
     * E no mesmo lugar, pela mesma razão: quem responde se o financeiro está
     * aberto é o banco, que conhece o plano E o teste em curso.
     *
     * Falhando a chamada, o palpite erra para MAIS. Descartar o erro e assumir
     * "não tem" faria o Financeiro sumir do menu de uma oficina que paga por
     * ele, calado, até a pessoa sair e entrar de novo — uma queda de rede de
     * dois segundos custaria o dia inteiro. Errando para mais, o pior caso é
     * ela abrir a tela e ler "seu plano não inclui", que explica o que está
     * acontecendo em vez de esconder.
     */
    const { data: financeiroAberto, error: erroDoFinanceiro } = await supabase.rpc(
      'minha_oficina_tem_financeiro',
    )
    setTemFinanceiro(
      erroDoFinanceiro
        ? linhaOficina?.plano === 'completo' || situacaoAtual === 'teste'
        : financeiroAberto === true,
    )

    // A marca entra assim que a oficina chega, antes de qualquer tela pintar.
    // E fica guardada no aparelho para a próxima tela de entrar já nascer com
    // a cara da oficina — no balcão, é sempre a mesma.
    if (linhaOficina) {
      aplicarCorDaMarca(linhaOficina.cor_primaria)
      lembrarMarca({
        nome: linhaOficina.nome,
        cor: linhaOficina.cor_primaria,
        logoMiniatura: linhaOficina.logo_miniatura_url,
      })
    }
  }, [])

  // O celular vira para o modo noturno no fim da tarde com o app aberto. Sem
  // isto, a cor da marca ficaria na versão do tema anterior até recarregar.
  useEffect(() => acompanharTemaDoAparelho(() => oficina?.cor_primaria), [oficina?.cor_primaria])

  useEffect(() => {
    let ativo = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!ativo) return
      setSessao(data.session)
      if (data.session?.user) {
        await carregarPerfil(data.session.user.id).catch(() => undefined)
      }
      if (ativo) {
        setPerfilCarregado(true)
        setCarregando(false)
      }
    })

    const { data: assinatura } = supabase.auth.onAuthStateChange(
      async (evento, novaSessao) => {
        if (!ativo) return
        setSessao(novaSessao)
        if (novaSessao?.user) {
          /*
           * Só o login de verdade abre a janela de espera.
           *
           * Este bloco recebe todo evento do Auth, e TOKEN_REFRESHED chega de
           * hora em hora — e de propósito quando o celular volta do bolso, pelo
           * efeito de renovação logo abaixo. Marcando falso em todos eles, a
           * `RotaProtegida` trocava a tela inteira por "Entrando…" e desmontava
           * o que estava aberto: o orçamento pela metade, a ordem em edição.
           * Exatamente no momento em que a pessoa ia salvar, que é a razão de
           * aquele efeito existir.
           */
          /*
           * E "login de verdade" quer dizer pessoa nova, não evento com esse nome.
           *
           * O Supabase também manda SIGNED_IN toda vez que a aba volta a ficar
           * visível, e toda vez que o app é aberto em OUTRA aba (ela avisa as
           * demais). Com a mesma pessoa já carregada, tratar isso como login
           * desmontava a tela — e o orçamento ou o cadastro pela metade sumia
           * só porque a pessoa foi olhar outra aba. Agora a mesma pessoa só
           * tem o cadastro relido por trás, sem trocar a tela.
           */
          if (evento === 'SIGNED_IN' && perfilDe.current !== novaSessao.user.id) {
            setPerfilCarregado(false)
          }
          await carregarPerfil(novaSessao.user.id).catch(() => undefined)
          if (ativo) setPerfilCarregado(true)
        } else {
          setPerfilCarregado(true)
          limparPerfil()
          setSemVinculo(false)
        }
      },
    )

    return () => {
      ativo = false
      assinatura.subscription.unsubscribe()
    }
  }, [carregarPerfil])

  /**
   * Renova a sessão quando o app volta para a frente.
   *
   * O token do Supabase vale uma hora e se renova sozinho por um cronômetro —
   * que o navegador do celular congela quando o app fica em segundo plano. Na
   * oficina, o celular volta do bolso meia hora depois com o token vencido, e a
   * primeira coisa que a pessoa faz é tentar salvar. Pedir a sessão aqui força a
   * renovação antes disso, e o erro nunca chega a acontecer.
   */
  useEffect(() => {
    async function renovar() {
      if (document.visibilityState !== 'visible') return
      const { data } = await supabase.auth.getSession()
      if (!data.session) return
      // Faltando menos de cinco minutos, renova já: é tempo de sobra para a
      // pessoa começar a preencher um formulário e ele vencer no meio.
      const expiraEm = (data.session.expires_at ?? 0) * 1000 - Date.now()
      if (expiraEm < 5 * 60 * 1000) {
        await supabase.auth.refreshSession().catch(() => undefined)
      }
    }

    document.addEventListener('visibilitychange', renovar)
    window.addEventListener('online', renovar)
    void renovar()

    return () => {
      document.removeEventListener('visibilitychange', renovar)
      window.removeEventListener('online', renovar)
    }
  }, [])

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
    setTemFinanceiro(false)
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
      situacao,
      temFinanceiro,
      carregando,
      semVinculo,
      perfilCarregado,
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
      situacao,
      temFinanceiro,
      carregando,
      semVinculo,
      perfilCarregado,
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
