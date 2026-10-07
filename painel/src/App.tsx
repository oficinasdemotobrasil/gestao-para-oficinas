import { Fragment, useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Negocio } from './Negocio'
import { Vitalicios } from './Vitalicios'
import {
  FichaDaOficina,
  data,
  contatoPrincipal,
  linkDoEmail,
  linkDoWhatsApp,
  mensagemDaSituacao,
  mensagemDeAusencia,
} from './Contato'
import {
  supabase,
  listarOficinas,
  criarOficina,
  mudarPlano,
  mudarSituacao,
  ROTULO_DO_PLANO,
  ROTULO_DA_SITUACAO,
  definirPrazo,
  entrarComoSuporte,
  sairDoSuporte,
  dinheiro,
  ROTULO_CALCULADO,
  TOM_DA_SITUACAO,
  ROTULO_DO_PERIODO,
  alertaDeFotos,
  type Indicadores,
  type PainelDoNegocio,
  type OficinaNaLista,
  type Plano,
  type Situacao,
  type SituacaoCalculada,
} from './plataforma'

const PLANOS: Plano[] = ['gratuito', 'essencial', 'completo']
const SITUACOES: Situacao[] = ['ativa', 'suspensa', 'cancelada']


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
      className="grid w-full grid-cols-1 gap-4 rounded-card bg-superficie p-6 tablet:grid-cols-2"
    >
      <h2 className="text-lg font-semibold text-claro tablet:col-span-2">Nova oficina</h2>

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
          {PLANOS.filter((p) => p !== 'essencial').map((p) => (
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

      <label className="flex flex-col gap-1.5 tablet:col-span-2">
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
        <p role="alert" className="rounded-controle bg-erro-fundo px-4 py-3 text-sm text-erro tablet:col-span-2">
          {erro}
        </p>
      )}

      <div className="flex gap-3 tablet:col-span-2 tablet:justify-end">
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

/** "há 3 dias" diz mais do que uma data: o que importa é o tempo sumido. */
function desdeQuando(iso: string | null): { texto: string; sumido: boolean } {
  if (!iso) return { texto: 'Nunca entrou', sumido: true }
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (dias <= 0) return { texto: 'Hoje', sumido: false }
  if (dias === 1) return { texto: 'Ontem', sumido: false }
  return { texto: `Há ${dias} dias`, sumido: dias >= 14 }
}

/** Um número grande com o rótulo embaixo. É a leitura de relance da plataforma. */
function Indicador({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string
  valor: string | number
  detalhe?: string
}) {
  return (
    <div className="rounded-card bg-superficie p-4">
      <p className="text-xs text-claro-secundario">{rotulo}</p>
      <p className="pt-1 text-2xl font-bold text-claro">{valor}</p>
      {detalhe && <p className="text-xs text-claro-secundario">{detalhe}</p>}
    </div>
  )
}

const PRAZOS = [
  { rotulo: 'Sem prazo (cortesia)', dias: null },
  // Depois de devolver o dinheiro de quem desistiu no prazo de arrependimento:
  // sem isto, o período estornado continuava liberado.
  { rotulo: 'Acaba hoje', dias: 0 },
  { rotulo: 'Mais 7 dias', dias: 7 },
  { rotulo: 'Mais 14 dias', dias: 14 },
  { rotulo: 'Mais 30 dias', dias: 30 },
]

function emDias(dias: number | null): string | null {
  if (dias === null) return null
  const d = new Date()
  d.setDate(d.getDate() + dias)
  // A data daqui, e não a de Greenwich: depois das 21h em Recife, o
  // `toISOString` já devolvia o dia seguinte.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Lista({ sessao }: { sessao: Session }) {
  const [oficinas, setOficinas] = useState<OficinaNaLista[] | null>(null)
  const [indicadores, setIndicadores] = useState<Indicadores | null>(null)
  const [negocio, setNegocio] = useState<PainelDoNegocio | null>(null)
  const [aba, setAba] = useState<'negocio' | 'oficinas' | 'vitalicios'>('negocio')
  const [erro, setErro] = useState('')
  const [mexendo, setMexendo] = useState<string | null>(null)

  /*
   * Entrar na oficina do cliente.
   *
   * O motivo é pedido antes, e não depois, porque depois ninguém escreve. Ele
   * é a única resposta que vai existir se um dia alguém perguntar quem olhou os
   * dados dos clientes daquela oficina.
   */
  const [entrandoEm, setEntrandoEm] = useState<OficinaNaLista | null>(null)
  const [motivoDoSuporte, setMotivoDoSuporte] = useState('')
  const [abrindoSuporte, setAbrindoSuporte] = useState(false)

  /*
   * O atendimento aberto nesta tela. Existe para dar um jeito de encerrar antes
   * dos 30 minutos: a função de sair existia desde o começo, mas nenhum botão a
   * chamava — a revisão pegou. Fechar ao terminar é o que deixa o registro dizer
   * quanto tempo o atendimento durou de verdade.
   */
  const [atendimentoAberto, setAtendimentoAberto] = useState<{
    oficinaId: string
    nome: string
    expira: string
  } | null>(null)
  const [filtroSituacao, setFiltroSituacao] = useState<string>('')
  const [filtroPlano, setFiltroPlano] = useState<string>('')
  const [busca, setBusca] = useState('')
  /** A oficina com a ficha aberta. Uma por vez: duas abertas viram uma parede. */
  const [fichaAberta, setFichaAberta] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const r = await listarOficinas()
      setOficinas(r.oficinas)
      setIndicadores(r.indicadores)
      setNegocio(r.painel)
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

  const visiveis = (oficinas ?? []).filter(
    (o) =>
      (!filtroSituacao || o.situacao === filtroSituacao) &&
      (!filtroPlano || o.plano === filtroPlano) &&
      (!busca.trim() ||
        [o.nome, o.cidade, o.telefone, o.cnpj, ...o.responsaveis.flatMap((p) => [p.nome, p.email, p.telefone])]
          .join(' ')
          .toLowerCase()
          .includes(busca.trim().toLowerCase())),
  )

  const porSituacao = indicadores?.por_situacao ?? {}

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
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

      {/* Duas visões, e a ordem diz o que importa: primeiro o negócio, depois
          a lista de quem mexer. */}
      <div className="flex gap-2 pb-6">
        {([
          ['negocio', 'O negócio'],
          ['oficinas', 'As oficinas'],
          ['vitalicios', 'Vitalícios'],
        ] as const).map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            onClick={() => setAba(valor)}
            aria-pressed={aba === valor}
            className={[
              'h-11 rounded-controle px-5 text-sm font-semibold',
              aba === valor
                ? 'bg-acento text-claro'
                : 'border border-borda-escura text-escuro',
            ].join(' ')}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === 'negocio' && negocio && <Negocio painel={negocio} />}

      {aba === 'vitalicios' && <Vitalicios oficinas={oficinas ?? []} aoMudar={() => void carregar()} />}

      {/* Os números do negócio ------------------------------------------------ */}
      {aba === 'oficinas' && indicadores && (
        <div className="grid grid-cols-2 gap-3 pb-6 tablet:grid-cols-3 desktop:grid-cols-6">
          <Indicador
            rotulo="Receita mensal"
            valor={dinheiro(Number(indicadores.receita_mensal))}
            detalhe="só oficinas ativas"
          />
          <Indicador rotulo="Ativas" valor={porSituacao.ativa ?? 0} />
          <Indicador rotulo="Em teste" valor={porSituacao.teste ?? 0} />
          <Indicador
            rotulo="Atrasadas"
            valor={(porSituacao.atrasada ?? 0) + (porSituacao.bloqueada ?? 0)}
            detalhe={`${porSituacao.bloqueada ?? 0} já bloqueada(s)`}
          />
          <Indicador rotulo="Novas no mês" valor={indicadores.novas_no_mes} />
          <Indicador
            rotulo="Saindo"
            valor={indicadores.saindo}
            detalhe={`${indicadores.encerramentos_no_mes} pedido(s) no mês`}
          />
        </div>
      )}

      {/* Filtros --------------------------------------------------------------- */}
      {aba === 'oficinas' && (
      <div className="flex flex-wrap items-center gap-3 pb-4">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Oficina, cidade, responsável, e-mail ou telefone"
          aria-label="Buscar oficina"
          className="h-11 min-w-[14rem] flex-1 rounded-controle border border-borda-escura bg-transparent px-4 text-sm text-escuro placeholder:text-escuro-secundario"
        />
        <select
          value={filtroSituacao}
          onChange={(e) => setFiltroSituacao(e.target.value)}
          aria-label="Filtrar por situação"
          className="h-11 rounded-controle border border-borda-escura bg-transparent px-3 text-sm text-escuro"
        >
          <option value="">Todas as situações</option>
          {(Object.keys(ROTULO_CALCULADO) as SituacaoCalculada[]).map((s) => (
            <option key={s} value={s}>
              {ROTULO_CALCULADO[s]}
            </option>
          ))}
        </select>
        <select
          value={filtroPlano}
          onChange={(e) => setFiltroPlano(e.target.value)}
          aria-label="Filtrar por plano"
          className="h-11 rounded-controle border border-borda-escura bg-transparent px-3 text-sm text-escuro"
        >
          <option value="">Todos os planos</option>
          {PLANOS.filter((p) => p !== 'essencial').map((p) => (
            <option key={p} value={p}>
              {ROTULO_DO_PLANO[p]}
            </option>
          ))}
        </select>
      </div>
      )}

      {aba === 'oficinas' && (oficinas === null ? (
        <p className="text-escuro-secundario">Carregando…</p>
      ) : visiveis.length === 0 ? (
        <p className="text-escuro-secundario">
          {oficinas.length === 0
            ? 'Nenhuma oficina ainda. Crie a primeira no botão acima.'
            : 'Nenhuma oficina com esses filtros.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card bg-superficie">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-borda-clara">
                {['Oficina', 'Uso no mês', 'Último acesso', 'Plano', 'Situação', 'Acesso até', 'Suporte'].map(
                  (t) => (
                    <th key={t} className="px-4 py-3 text-sm font-medium text-claro-secundario">
                      {t}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((o) => {
                const acesso = desdeQuando(o.ultimo_acesso)
                const aberta = fichaAberta === o.id
                const alternarFicha = () => setFichaAberta(aberta ? null : o.id)
                const { pessoa, telefone } = contatoPrincipal(o)
                const daSituacao = mensagemDaSituacao(o)
                const deAusencia = mensagemDeAusencia(o)
                // Prazo que pede conversa: o teste acabando ou a mensalidade vencida.
                const prazoPedeConversa = ['teste', 'atrasada', 'bloqueada'].includes(o.situacao)
                return (
                  <Fragment key={o.id}>
                  <tr className={`border-b border-borda-clara ${aberta ? 'bg-borda-clara/30' : ''}`}>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={alternarFicha}
                        aria-expanded={aberta}
                        className="flex items-center gap-2 text-left font-medium text-claro hover:underline"
                      >
                        <span aria-hidden className="inline-block w-3 text-xs text-claro-secundario">
                          {aberta ? '▾' : '▸'}
                        </span>
                        {o.nome}
                      </button>
                      <span className="block pl-5 text-xs text-claro-secundario">
                        {o.cidade || 'sem cidade'} · desde {data(o.criado_em)}
                        {o.excluir_em && ' · pediu para sair'}
                      </span>
                      {pessoa && (
                        <span className="block pl-5 text-xs text-claro-secundario">
                          {pessoa.nome.split(' ')[0]} ·{' '}
                          <a
                            href={linkDoEmail(pessoa.email, `GIRO — ${o.nome}`, `Oi, ${pessoa.nome.split(' ')[0]}!\n\n`)}
                            className="underline decoration-borda-clara underline-offset-2 hover:text-claro"
                          >
                            {pessoa.email}
                          </a>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-claro">
                      <button type="button" onClick={alternarFicha} className="text-left hover:underline">
                        {o.ordens_no_mes} OS · {o.orcamentos_no_mes} orç.
                        <span className="block text-xs text-claro-secundario">
                          {o.pessoas} {o.pessoas === 1 ? 'pessoa' : 'pessoas'}
                        </span>
                        {alertaDeFotos(o) && (
                          <span
                            className={`mt-1 inline-block rounded-badge px-2 py-0.5 text-xs font-medium ${
                              alertaDeFotos(o) === 'limite'
                                ? 'bg-erro-fundo text-erro-forte'
                                : 'bg-atencao-fundo text-atencao-forte'
                            }`}
                          >
                            {o.fotos!.em_uso} de {o.fotos!.limite} fotos
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {deAusencia ? (
                        <a
                          href={linkDoWhatsApp(telefone, deAusencia.texto)}
                          target="_blank"
                          rel="noreferrer"
                          title={`WhatsApp: ${deAusencia.rotulo.toLowerCase()}`}
                          className="font-semibold text-erro underline decoration-erro/40 underline-offset-4 hover:decoration-erro"
                        >
                          {acesso.texto}
                        </a>
                      ) : (
                        <span className="text-claro">{acesso.texto}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={o.plano}
                        disabled={mexendo === o.id}
                        onChange={(e) =>
                          void agir(o.id, () => mudarPlano(o.id, e.target.value as Plano))
                        }
                        className="h-9 rounded-controle border border-borda-clara px-2 text-sm text-claro"
                      >
                        {/* O Essencial saiu de venda (0082): só aparece para quem
                            ainda está nele, para o seletor não mostrar outra coisa. */}
                        {PLANOS.filter((p) => p !== 'essencial' || o.plano === 'essencial').map((p) => (
                          <option key={p} value={p}>
                            {ROTULO_DO_PLANO[p]}
                          </option>
                        ))}
                      </select>
                      {/* Como paga, além de qual plano (0082). */}
                      <span className="block pt-1 text-xs text-claro-secundario">
                        {o.vitalicia
                          ? '♾ Vitalícia'
                          : o.assinatura
                            ? `${ROTULO_DO_PERIODO[o.assinatura.periodo ?? 'mensal']}${(o.assinatura.parcelas ?? 1) > 1 ? ` em ${o.assinatura.parcelas}x` : ''}`
                            : 'Sem assinatura'}
                      </span>
                      {o.arrependimento && (
                        <button
                          type="button"
                          onClick={alternarFicha}
                          className={`mt-1 inline-block rounded-badge px-2 py-0.5 text-left text-xs font-semibold ${
                            o.arrependimento.situacao === 'devolver'
                              ? 'bg-erro-fundo text-erro-forte'
                              : 'bg-atencao-fundo text-atencao-forte'
                          }`}
                        >
                          {o.arrependimento.situacao === 'devolver'
                            ? `Devolver ${dinheiro(o.arrependimento.valor)}`
                            : 'Devolvido: ajustar o acesso'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {/* O selo é o atalho da conversa que a situação pede. */}
                      <a
                        href={linkDoWhatsApp(telefone, daSituacao.texto)}
                        target="_blank"
                        rel="noreferrer"
                        title={`WhatsApp: ${daSituacao.rotulo.toLowerCase()}`}
                        className={`mr-2 inline-block rounded-badge px-2 py-1 text-xs font-medium underline-offset-2 hover:underline ${TOM_DA_SITUACAO[o.situacao]}`}
                      >
                        {ROTULO_CALCULADO[o.situacao]}
                      </a>
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
                    <td className="px-4 py-3">
                      {o.acesso_ate && prazoPedeConversa ? (
                        <a
                          href={linkDoWhatsApp(telefone, daSituacao.texto)}
                          target="_blank"
                          rel="noreferrer"
                          title={`WhatsApp: ${daSituacao.rotulo.toLowerCase()}`}
                          className="block text-sm text-claro underline decoration-borda-clara underline-offset-4 hover:decoration-claro"
                        >
                          {data(o.acesso_ate)}
                        </a>
                      ) : (
                        <span className="block text-sm text-claro">
                          {o.acesso_ate ? data(o.acesso_ate) : 'Sem prazo'}
                        </span>
                      )}
                      <select
                        value=""
                        disabled={mexendo === o.id}
                        aria-label={`Mudar o prazo de ${o.nome}`}
                        onChange={(e) => {
                          const escolhido = PRAZOS[Number(e.target.value)]
                          if (!escolhido) return
                          void agir(o.id, () => definirPrazo(o.id, emDias(escolhido.dias)))
                        }}
                        className="mt-1 h-9 rounded-controle border border-borda-clara px-2 text-xs text-claro"
                      >
                        <option value="">Mudar prazo…</option>
                        {PRAZOS.map((p, i) => (
                          <option key={p.rotulo} value={i}>
                            {p.rotulo}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={mexendo === o.id}
                        onClick={() => {
                          setEntrandoEm(o)
                          setMotivoDoSuporte('')
                        }}
                        className="h-9 rounded-controle border border-borda-clara px-3 text-sm text-claro hover:bg-claro/5 disabled:opacity-50"
                      >
                        Entrar
                      </button>
                    </td>
                  </tr>
                  {aberta && (
                    <tr className="border-b border-borda-clara">
                      <td colSpan={7} className="p-0">
                        <FichaDaOficina o={o} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      {atendimentoAberto && (
        <div className="mb-4 flex flex-col gap-3 rounded-card border border-acento bg-acento-suave px-4 py-3 tablet:flex-row tablet:items-center tablet:justify-between">
          <p className="text-sm text-claro">
            Atendimento aberto em <strong>{atendimentoAberto.nome}</strong> até{' '}
            {new Date(atendimentoAberto.expira).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            . Fecha sozinho no horário, mas encerre ao terminar.
          </p>
          <button
            type="button"
            onClick={() => {
              sairDoSuporte(atendimentoAberto.oficinaId)
                .then(() => setAtendimentoAberto(null))
                .catch((e: Error) => alert(e.message))
            }}
            className="h-10 shrink-0 rounded-controle bg-claro px-4 text-sm font-semibold text-escuro"
          >
            Encerrar atendimento
          </button>
        </div>
      )}

      {entrandoEm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 tablet:items-center">
          <div className="w-full max-w-lg rounded-card bg-superficie p-6">
            <h2 className="text-lg font-semibold text-claro">
              Entrar na {entrandoEm.nome}
            </h2>
            <p className="pt-2 text-sm text-claro-secundario">
              O sistema abre numa aba nova, logado como <strong>Suporte GIRO</strong>. O
              acesso dura 30 minutos e fecha sozinho. Tudo o que você fizer lá fica
              com esse nome.
            </p>

            <label className="block pt-5 text-sm text-claro-secundario" htmlFor="motivo-suporte">
              Por que você está entrando?
            </label>
            <textarea
              id="motivo-suporte"
              rows={3}
              value={motivoDoSuporte}
              onChange={(e) => setMotivoDoSuporte(e.target.value)}
              placeholder="Cliente relatou que o orçamento 128 sumiu da lista"
              className="mt-2 w-full rounded-controle border border-borda-clara bg-transparent p-3 text-sm text-claro"
            />
            <p className="pt-2 text-xs text-claro-secundario">
              Fica guardado com o seu nome e a data. Escreva o que você diria a
              alguém que perguntasse depois — “suporte” não responde nada.
            </p>

            <div className="flex flex-col gap-2 pt-6 tablet:flex-row tablet:justify-end">
              <button
                type="button"
                onClick={() => setEntrandoEm(null)}
                className="h-11 rounded-controle border border-borda-clara px-5 text-sm text-claro"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={motivoDoSuporte.trim().length < 5 || abrindoSuporte}
                onClick={() => {
                  setAbrindoSuporte(true)
                  entrarComoSuporte(entrandoEm.id, motivoDoSuporte.trim())
                    .then((r) => {
                      setAtendimentoAberto({
                        oficinaId: entrandoEm.id,
                        nome: r.oficina,
                        expira: r.expira_em,
                      })
                      setEntrandoEm(null)
                      // A aba é aberta pelo clique da pessoa, não por
                      // redirecionamento: assim o painel continua aberto do lado.
                      window.open(r.link, '_blank', 'noopener')
                    })
                    .catch((e: Error) => alert(e.message))
                    .finally(() => setAbrindoSuporte(false))
                }}
                className="h-11 rounded-controle bg-acento px-5 text-sm font-semibold text-escuro disabled:opacity-50"
              >
                {abrindoSuporte ? 'Abrindo…' : 'Entrar na oficina'}
              </button>
            </div>
          </div>
        </div>
      )}

      {aba === 'oficinas' && (
      <p className="pt-6 text-xs text-escuro-secundario">
        A situação em destaque é a que vale hoje, calculada das datas — pode ser
        diferente do que está no seletor, que guarda o que foi decidido à mão.
        Suspender deixa a oficina em modo consulta: ela continua vendo o histórico
        e para de registrar. Rebaixar o plano não desativa ninguém que já tem acesso.
      </p>
      )}
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
