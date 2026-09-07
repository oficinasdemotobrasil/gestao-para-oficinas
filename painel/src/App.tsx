import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  supabase,
  listarOficinas,
  criarOficina,
  mudarPlano,
  mudarSituacao,
  ROTULO_DO_PLANO,
  ROTULO_DA_SITUACAO,
  type OficinaNaLista,
  type Plano,
  type Situacao,
} from './plataforma'

const PLANOS: Plano[] = ['gratuito', 'essencial', 'completo']
const SITUACOES: Situacao[] = ['ativa', 'suspensa', 'cancelada']

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

/** Login. É a única tela para quem não está autenticado. */
function Entrar() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    setEnviando(false)
    // Mesma mensagem para e-mail errado e senha errada: distinguir as duas conta
    // a quem tenta quais e-mails existem.
    if (error) setErro('E-mail ou senha incorretos.')
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-5">
      <form
        onSubmit={entrar}
        className="flex w-full max-w-sm flex-col gap-4 rounded-card bg-superficie p-6"
      >
        <div>
          <h1 className="text-2xl font-bold text-claro">Plataforma</h1>
          <p className="pt-1 text-sm text-claro-secundario">
            Administração das oficinas. Não é o aplicativo do cliente.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-claro-secundario">E-mail</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-controle border border-borda-clara px-4 text-base text-claro"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-claro-secundario">Senha</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="h-12 rounded-controle border border-borda-clara px-4 text-base text-claro"
          />
        </label>

        {erro && (
          <p role="alert" className="rounded-controle bg-erro-fundo px-4 py-3 text-sm text-erro">
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="h-12 rounded-controle bg-acento text-base font-semibold text-claro disabled:opacity-50"
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

/** Cria uma oficina já com o primeiro responsável. */
function NovaOficina({ aoCriar }: { aoCriar: () => void }) {
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  // Enquanto não há cobrança, oficina nova nasce com tudo liberado. Os limites
  // continuam de pé no banco: quando a cobrança existir, basta escolher outro
  // plano aqui e nas oficinas já cadastradas. Apertar depois é mais fácil do
  // que reconstruir a trava.
  const [plano, setPlano] = useState<Plano>('completo')
  const [adminNome, setAdminNome] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminSenha, setAdminSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await criarOficina({
        nome,
        plano,
        admin_nome: adminNome,
        admin_email: adminEmail,
        admin_senha: adminSenha,
      })
      setAberto(false)
      setNome('')
      setAdminNome('')
      setAdminEmail('')
      setAdminSenha('')
      aoCriar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="h-11 rounded-controle bg-acento px-5 text-sm font-semibold text-claro"
      >
        Nova oficina
      </button>
    )
  }

  return (
    <form
      onSubmit={criar}
      className="grid w-full grid-cols-1 gap-4 rounded-card bg-superficie p-6 md:grid-cols-2"
    >
      <h2 className="text-lg font-semibold text-claro md:col-span-2">Nova oficina</h2>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-claro-secundario">Nome da oficina</span>
        <input
          required
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="h-11 rounded-controle border border-borda-clara px-3 text-claro"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-claro-secundario">Plano</span>
        <select
          value={plano}
          onChange={(e) => setPlano(e.target.value as Plano)}
          className="h-11 rounded-controle border border-borda-clara px-3 text-claro"
        >
          {PLANOS.map((p) => (
            <option key={p} value={p}>
              {ROTULO_DO_PLANO[p]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-claro-secundario">Responsável</span>
        <input
          required
          value={adminNome}
          onChange={(e) => setAdminNome(e.target.value)}
          className="h-11 rounded-controle border border-borda-clara px-3 text-claro"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-claro-secundario">E-mail de acesso</span>
        <input
          type="email"
          required
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          className="h-11 rounded-controle border border-borda-clara px-3 text-claro"
        />
      </label>

      <label className="flex flex-col gap-1.5 md:col-span-2">
        <span className="text-sm font-medium text-claro-secundario">Senha provisória</span>
        <input
          type="text"
          required
          minLength={8}
          value={adminSenha}
          onChange={(e) => setAdminSenha(e.target.value)}
          className="h-11 rounded-controle border border-borda-clara px-3 text-claro"
        />
        {/* Em texto aberto de propósito: você vai ditar esta senha para a
            oficina, e escondê-la aqui só faria você digitar errado. Peça que
            troquem no primeiro acesso. */}
        <span className="text-xs text-claro-secundario">
          Pelo menos 8 caracteres. Combine com a oficina que ela troque no primeiro acesso.
        </span>
      </label>

      {erro && (
        <p role="alert" className="rounded-controle bg-erro-fundo px-4 py-3 text-sm text-erro md:col-span-2">
          {erro}
        </p>
      )}

      <div className="flex gap-3 md:col-span-2 md:justify-end">
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="h-11 rounded-controle border border-borda-clara px-5 text-sm font-semibold text-claro"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando}
          className="h-11 rounded-controle bg-acento px-5 text-sm font-semibold text-claro disabled:opacity-50"
        >
          {enviando ? 'Criando…' : 'Criar oficina'}
        </button>
      </div>
    </form>
  )
}

const CORES_DA_SITUACAO: Record<Situacao, string> = {
  ativa: 'bg-sucesso-fundo text-sucesso',
  suspensa: 'bg-atencao-fundo text-atencao',
  cancelada: 'bg-erro-fundo text-erro',
}

function Lista({ sessao }: { sessao: Session }) {
  const [oficinas, setOficinas] = useState<OficinaNaLista[] | null>(null)
  const [erro, setErro] = useState('')
  const [mexendo, setMexendo] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setErro('')
    try {
      setOficinas(await listarOficinas())
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function agir(id: string, acao: () => Promise<unknown>) {
    setMexendo(id)
    setErro('')
    try {
      await acao()
      await carregar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setMexendo(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-escuro">Oficinas</h1>
          <p className="text-sm text-escuro-secundario">
            {oficinas ? `${oficinas.length} no total` : 'Carregando…'} · {sessao.user.email}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <NovaOficina aoCriar={carregar} />
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="h-11 rounded-controle border border-borda-escura px-5 text-sm font-semibold text-escuro"
          >
            Sair
          </button>
        </div>
      </header>

      {erro && (
        <p role="alert" className="mb-4 rounded-controle bg-erro-fundo px-4 py-3 text-sm text-erro">
          {erro}
        </p>
      )}

      {oficinas === null ? (
        <p className="text-escuro-secundario">Carregando…</p>
      ) : oficinas.length === 0 ? (
        <p className="text-escuro-secundario">
          Nenhuma oficina ainda. Crie a primeira no botão acima.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card bg-superficie">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-borda-clara">
                {['Oficina', 'Pessoas', 'Plano', 'Situação', 'Desde'].map((t) => (
                  <th key={t} className="px-4 py-3 text-sm font-medium text-claro-secundario">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {oficinas.map((o) => (
                <tr key={o.id} className="border-b border-borda-clara last:border-b-0">
                  <td className="px-4 py-3">
                    <span className="block font-medium text-claro">{o.nome}</span>
                    <span className="block text-xs text-claro-secundario">
                      {[o.cidade, o.telefone].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-claro">{o.pessoas}</td>
                  <td className="px-4 py-3">
                    <select
                      value={o.plano}
                      disabled={mexendo === o.id}
                      onChange={(e) =>
                        void agir(o.id, () => mudarPlano(o.id, e.target.value as Plano))
                      }
                      className="h-9 rounded-controle border border-borda-clara px-2 text-sm text-claro"
                    >
                      {PLANOS.map((p) => (
                        <option key={p} value={p}>
                          {ROTULO_DO_PLANO[p]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`mr-2 inline-block rounded-badge px-2 py-1 text-xs font-medium ${CORES_DA_SITUACAO[o.status]}`}
                    >
                      {ROTULO_DA_SITUACAO[o.status]}
                    </span>
                    <select
                      value={o.status}
                      disabled={mexendo === o.id}
                      onChange={(e) =>
                        void agir(o.id, () => mudarSituacao(o.id, e.target.value as Situacao))
                      }
                      className="h-9 rounded-controle border border-borda-clara px-2 text-sm text-claro"
                    >
                      {SITUACOES.map((s) => (
                        <option key={s} value={s}>
                          {ROTULO_DA_SITUACAO[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-sm text-claro-secundario">{data(o.criado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="pt-6 text-xs text-escuro-secundario">
        Suspender deixa a oficina em modo consulta: ela continua vendo o histórico
        e para de registrar. Rebaixar o plano não desativa ninguém que já tem acesso.
      </p>
    </div>
  )
}

export function App() {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session)
      setCarregando(false)
    })
    const { data: assinatura } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s))
    return () => assinatura.subscription.unsubscribe()
  }, [])

  if (carregando) {
    return <p className="p-8 text-escuro-secundario">Carregando…</p>
  }
  return sessao ? <Lista sessao={sessao} /> : <Entrar />
}
