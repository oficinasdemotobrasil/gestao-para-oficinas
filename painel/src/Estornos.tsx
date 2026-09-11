/**
 * Os estornos.
 *
 * Devolver dinheiro é a operação que mais dá problema quando fica só na
 * cabeça de alguém: acontece raramente, envolve prazo legal e tem um cliente
 * irritado do outro lado. Esta tela existe para que ninguém precise lembrar
 * do processo — ela diz quem está esperando, quanto, por quê, e leva até o
 * lugar de fazer.
 *
 * O que ela NÃO faz é estornar. O dinheiro sai da conta do Asaas, com a mão
 * de quem é dono dela. Aqui só se anota o que foi feito.
 */
import { useEffect, useState } from 'react'
import { dinheiro, listarEstornos, marcarEstorno, type Estorno } from './plataforma'

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

/** Onde fica o estorno dentro do Asaas. O caminho muda pouco; o código, nunca. */
const CAMINHO_NO_ASAAS = 'Cobranças → busque o código → menu (⋮) → Estornar'

function Selo({ situacao, temDireito }: { situacao: Estorno['situacao']; temDireito: boolean }) {
  if (situacao === 'devolvido') {
    return (
      <span className="rounded-badge bg-sucesso-fundo px-2.5 py-1 text-xs font-semibold text-sucesso-forte">
        Devolvido
      </span>
    )
  }
  if (situacao === 'dispensado') {
    return (
      <span className="rounded-badge bg-superficie-escura px-2.5 py-1 text-xs font-semibold text-escuro-secundario">
        Não vou devolver
      </span>
    )
  }
  if (situacao === 'sem_pedido') {
    return (
      <span className="rounded-badge bg-superficie-escura px-2.5 py-1 text-xs font-semibold text-escuro-secundario">
        Nada a devolver
      </span>
    )
  }
  return (
    <span
      className={`rounded-badge px-2.5 py-1 text-xs font-semibold ${
        temDireito ? 'bg-erro-fundo text-erro-forte' : 'bg-atencao-fundo text-atencao-forte'
      }`}
    >
      {temDireito ? 'Devolver — direito do cliente' : 'Devolver?'}
    </span>
  )
}

function Linha({
  e,
  ocupado,
  aoMarcar,
}: {
  e: Estorno
  ocupado: boolean
  aoMarcar: (situacao: 'feito' | 'dispensado' | 'desfazer', observacao?: string) => void
}) {
  const [recusando, setRecusando] = useState(false)
  const [porque, setPorque] = useState('')
  const [copiado, setCopiado] = useState(false)
  const resolvido = e.situacao !== 'pendente'

  /*
   * O Asaas não publica endereço direto para a tela de estorno, e inventar um
   * levaria a plataforma para uma página de erro. Então o botão faz as duas
   * coisas que resolvem de verdade: abre a cobrança certa — o endereço veio do
   * próprio provedor, junto com o aviso de pagamento — e deixa o código na
   * área de transferência, pronto para colar na busca do painel.
   */
  const abrirNoAsaas = async () => {
    try {
      await navigator.clipboard.writeText(e.cobranca_id)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 4000)
    } catch {
      // Sem área de transferência o código continua na tela, para copiar à mão.
    }
    window.open(e.endereco_no_provedor ?? 'https://www.asaas.com/', '_blank', 'noopener')
  }

  return (
    <li
      className={`rounded-card px-4 py-3 ${
        resolvido ? 'bg-superficie opacity-70' : 'bg-superficie'
      } ${e.situacao === 'pendente' && e.tem_direito ? 'ring-1 ring-erro' : ''}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-claro">{e.oficina}</span>
        <span className="text-lg font-bold tabular-nums text-claro">
          {dinheiro(Number(e.valor))}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1.5">
        <Selo situacao={e.situacao} temDireito={e.tem_direito} />
        <span className="text-xs text-claro-secundario">
          pago em {data(e.pago_em)} · {e.forma === 'PIX' ? 'Pix' : e.forma}
        </span>
      </div>

      <p className="pt-1.5 text-sm text-claro-secundario">{e.motivo}</p>

      {e.situacao !== 'sem_pedido' && (
        <div className="flex flex-wrap items-center gap-2 pt-3">
          {!resolvido && (
            <button
              onClick={() => void abrirNoAsaas()}
              className="h-10 rounded-controle bg-acento px-4 text-sm font-semibold text-claro"
            >
              {copiado ? 'Código copiado — cole no Asaas' : 'Fazer estorno no Asaas'}
            </button>
          )}

          {!resolvido && !recusando && (
            <>
              <button
                disabled={ocupado}
                onClick={() => aoMarcar('feito')}
                className="h-10 rounded-controle border border-borda-clara px-4 text-sm font-medium text-claro disabled:opacity-50"
              >
                Já devolvi
              </button>
              <button
                disabled={ocupado}
                onClick={() => setRecusando(true)}
                className="h-10 rounded-controle px-3 text-sm text-claro-secundario underline disabled:opacity-50"
              >
                Não vou devolver
              </button>
            </>
          )}

          {resolvido && e.marcado_pela_plataforma && (
            <button
              disabled={ocupado}
              onClick={() => aoMarcar('desfazer')}
              className="h-9 rounded-controle px-3 text-sm text-claro-secundario underline disabled:opacity-50"
            >
              Desfazer
            </button>
          )}
        </div>
      )}

      {recusando && (
        /*
         * Não devolver o dinheiro de alguém precisa de motivo escrito. Daqui a
         * seis meses, com o cliente reclamando, ninguém lembra por quê.
         */
        <div className="flex flex-wrap items-center gap-2 pt-3">
          <input
            autoFocus
            value={porque}
            onChange={(ev) => setPorque(ev.target.value)}
            placeholder="Por que não vai devolver?"
            className="h-10 min-w-[16rem] flex-1 rounded-controle border border-borda-clara px-3 text-sm text-claro"
          />
          <button
            disabled={ocupado || porque.trim().length === 0}
            onClick={() => {
              aoMarcar('dispensado', porque.trim())
              setRecusando(false)
              setPorque('')
            }}
            className="h-10 rounded-controle bg-acento px-4 text-sm font-semibold text-claro disabled:opacity-50"
          >
            Confirmar
          </button>
          <button
            onClick={() => { setRecusando(false); setPorque('') }}
            className="h-10 px-2 text-sm text-claro-secundario underline"
          >
            Cancelar
          </button>
        </div>
      )}
    </li>
  )
}

export function Estornos() {
  const [lista, setLista] = useState<Estorno[] | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [mostrarResolvidos, setMostrarResolvidos] = useState(false)

  const carregar = async () => {
    try {
      setLista(await listarEstornos())
      setErro('')
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  useEffect(() => { void carregar() }, [])

  const marcar = async (
    e: Estorno,
    situacao: 'feito' | 'dispensado' | 'desfazer',
    observacao?: string,
  ) => {
    setOcupado(true)
    try {
      await marcarEstorno(e.cobranca_id, e.oficina_id, Number(e.valor), situacao, observacao)
      await carregar()
    } catch (x) {
      setErro((x as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  if (erro) {
    return (
      <section className="pt-8">
        <h2 className="pb-3 text-lg font-semibold text-escuro">Estornos</h2>
        <p role="alert" className="rounded-card bg-erro-fundo px-4 py-3 text-sm text-erro-forte">
          {erro}
        </p>
      </section>
    )
  }

  if (lista === null) {
    return (
      <section className="pt-8">
        <h2 className="pb-3 text-lg font-semibold text-escuro">Estornos</h2>
        <p className="text-sm text-escuro-secundario">Conferindo as cobranças…</p>
      </section>
    )
  }

  const pendentes = lista.filter((e) => e.situacao === 'pendente')
  const resolvidos = lista.filter((e) => e.situacao !== 'pendente')
  const aDevolver = pendentes.reduce((s, e) => s + Number(e.valor), 0)

  return (
    <section className="pt-8">
      <div className="flex flex-wrap items-baseline gap-3 pb-3">
        <h2 className="text-lg font-semibold text-escuro">Estornos</h2>
        <p className="text-sm text-escuro-secundario">
          {pendentes.length === 0
            ? 'ninguém está esperando devolução'
            : `${pendentes.length} esperando · ${dinheiro(aDevolver)}`}
        </p>
      </div>

      {pendentes.length > 0 && (
        <>
          <p className="pb-3 text-xs text-escuro-secundario">
            No Asaas: <strong className="text-escuro">{CAMINHO_NO_ASAAS}</strong>. O botão
            abre a cobrança certa e copia o código para você colar na busca.
          </p>
          <ul className="grid gap-2">
            {pendentes.map((e) => (
              <Linha
                key={e.cobranca_id}
                e={e}
                ocupado={ocupado}
                aoMarcar={(s, obs) => void marcar(e, s, obs)}
              />
            ))}
          </ul>
        </>
      )}

      {resolvidos.length > 0 && (
        <div className="pt-3">
          <button
            onClick={() => setMostrarResolvidos((v) => !v)}
            aria-expanded={mostrarResolvidos}
            className="text-sm text-escuro-secundario underline"
          >
            {mostrarResolvidos ? 'Esconder' : 'Ver'} as {resolvidos.length} cobranças já
            resolvidas
          </button>
          {mostrarResolvidos && (
            <ul className="grid gap-2 pt-3">
              {resolvidos.map((e) => (
                <Linha
                  key={e.cobranca_id}
                  e={e}
                  ocupado={ocupado}
                  aoMarcar={(s, obs) => void marcar(e, s, obs)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
