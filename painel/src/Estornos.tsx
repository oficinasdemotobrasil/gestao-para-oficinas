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

/**
 * Uma data pura do banco ("2026-09-11") não tem fuso, mas `new Date` finge que
 * tem: lê como meia-noite em UTC, que no Brasil é 21h do dia anterior. Numa
 * tela de dinheiro isso vira um pagamento com a data errada. Então a data pura
 * é montada peça por peça, e só o que tem hora passa pelo caminho normal.
 */
const data = (iso: string) => {
  const soData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (soData) return `${soData[3]}/${soData[2]}/${soData[1]}`
  return new Date(iso).toLocaleDateString('pt-BR')
}

/**
 * A lista de cobranças recebidas no Asaas, que é onde o estorno acontece. O
 * endereço é do painel de quem administra, não da fatura do cliente — e por
 * isso leva direto ao lugar de clicar em Estornar.
 */
const LISTA_NO_ASAAS =
  'https://www.asaas.com/payment/list?status=RECEIVED&itemsPerPage=10'

/** Formata para ler, não para copiar: quem copia leva o valor cru. */
function telefoneLegivel(t: string) {
  const d = t.replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t
}

function documentoLegivel(v: string) {
  const d = v.replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  if (d.length === 14)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  return v
}

/**
 * Um dado com botão de copiar ao lado.
 *
 * O que vai para a área de transferência é o valor CRU, sem ponto nem traço:
 * a busca do Asaas casa por dígito, e um CPF pontuado costuma não achar nada.
 * Na tela ele aparece pontuado, porque aí quem lê é gente.
 */
function Copiavel({
  rotulo,
  valor,
  paraCopiar,
}: {
  rotulo: string
  valor: string
  paraCopiar: string
}) {
  const [copiado, setCopiado] = useState(false)
  return (
    <span className="inline-flex items-center gap-1 rounded-badge bg-superficie-escura/5 px-2 py-1">
      <span className="text-xs text-claro-secundario">{rotulo}</span>
      <span className="text-xs tabular-nums text-claro">{valor}</span>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(paraCopiar)
            setCopiado(true)
            setTimeout(() => setCopiado(false), 2500)
          } catch {
            // Sem área de transferência o valor continua na tela, para copiar à mão.
          }
        }}
        aria-label={`Copiar ${rotulo} de busca`}
        className="rounded px-1.5 py-0.5 text-xs font-semibold text-acento-forte underline"
      >
        {copiado ? 'copiado' : 'copiar'}
      </button>
    </span>
  )
}

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
    window.open(LISTA_NO_ASAAS, '_blank', 'noopener')
  }

  return (
    <li
      /*
       * O que já foi resolvido tem de ficar discreto, não ilegível. A primeira
       * versão usava `opacity-70` no cartão inteiro — e opacidade apaga o
       * texto junto com o fundo: o cinza secundário caía para 1,9:1, medido no
       * navegador. Quem distingue resolvido de pendente aqui é o selo e a
       * ausência da borda vermelha, não a transparência.
       */
      className={`rounded-card bg-superficie px-4 py-3 ${
        e.situacao === 'pendente' && e.tem_direito ? 'ring-1 ring-erro' : ''
      }`}
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

      {/*
        Os dados que a busca do Asaas aceita. Ficam no cartão porque é aqui que
        a pessoa está olhando quando precisa deles — mandá-la procurar o
        telefone na aba "As oficinas" é o tipo de ida e volta que faz alguém
        desistir e deixar o estorno para depois.
      */}
      {!resolvido && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2">
          <Copiavel rotulo="cobrança" valor={e.cobranca_id} paraCopiar={e.cobranca_id} />
          {e.telefone && (
            <Copiavel
              rotulo="telefone"
              valor={telefoneLegivel(e.telefone)}
              paraCopiar={e.telefone.replace(/\D/g, '')}
            />
          )}
          {e.email && <Copiavel rotulo="e-mail" valor={e.email} paraCopiar={e.email} />}
          {e.documento && (
            <Copiavel
              rotulo={e.documento.replace(/\D/g, '').length === 14 ? 'CNPJ' : 'CPF'}
              valor={documentoLegivel(e.documento)}
              paraCopiar={e.documento.replace(/\D/g, '')}
            />
          )}
        </div>
      )}

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
              {/* A fatura não deixa estornar, mas confirma o valor e a data. */}
              {e.endereco_no_provedor && (
                <a
                  href={e.endereco_no_provedor}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-1 text-sm text-claro-secundario underline"
                >
                  ver a fatura
                </a>
              )}
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
            O botão abre a lista de cobranças recebidas no Asaas e copia o código.
            Lá: <strong className="text-escuro">cole na busca → menu (⋮) na linha →
            Estornar</strong>. Se o código não achar, tente o telefone, o e-mail ou
            o CPF.
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
            {mostrarResolvidos ? 'Esconder' : 'Ver'}{' '}
            {resolvidos.length === 1
              ? 'a outra cobrança paga'
              : `as outras ${resolvidos.length} cobranças pagas`}
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
