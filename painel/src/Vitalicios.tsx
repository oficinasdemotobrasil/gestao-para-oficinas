import { useCallback, useEffect, useState } from 'react'
import {
  dinheiro,
  homologarVitalicio,
  listarVitalicios,
  registrarVitalicio,
  type OficinaNaLista,
  type Vitalicio,
} from './plataforma'

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

/**
 * As 30 vagas vitalícias (0082).
 *
 * Três coisas acontecem aqui, e só aqui:
 *   - registrar uma venda feita fora do app (pagou por fora, ainda não tem
 *     oficina no GIRO) — ela já ocupa a vaga;
 *   - homologar: quando essa pessoa se cadastrar, ligar a vaga à oficina dela.
 *     O acesso perde o prazo e a mensalidade, se havia, é cancelada;
 *   - ver o que o app vendeu sozinho, inclusive a reserva de quem está pagando
 *     e a venda que chegou depois de esgotar (marcada para conferir).
 *
 * A trava das 30 é do banco: esta tela pode errar a conta, ele não.
 */
export function Vitalicios({ oficinas, aoMudar }: { oficinas: OficinaNaLista[]; aoMudar: () => void }) {
  const [lista, setLista] = useState<Vitalicio[] | null>(null)
  const [restantes, setRestantes] = useState(0)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [comprador, setComprador] = useState('')
  const [email, setEmail] = useState('')
  const [valor, setValor] = useState('2000')
  const [salvando, setSalvando] = useState(false)
  const [ligando, setLigando] = useState<Record<string, string>>({})

  const carregar = useCallback(async () => {
    try {
      const r = await listarVitalicios()
      setLista(r.vitalicios)
      setRestantes(r.restantes)
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function registrar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setAviso('')
    setSalvando(true)
    try {
      await registrarVitalicio(comprador.trim(), email.trim() || null, Number(valor.replace(',', '.')))
      setComprador('')
      setEmail('')
      setAviso('Venda registrada. Quando a pessoa se cadastrar, homologue a vaga na oficina dela.')
      await carregar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function homologar(v: Vitalicio) {
    const oficinaId = ligando[v.id]
    if (!oficinaId) return
    const nome = oficinas.find((o) => o.id === oficinaId)?.nome
    if (!window.confirm(`Ligar a vaga de ${v.comprador} à oficina ${nome}? O acesso dela passa a ser para sempre.`)) return
    setErro('')
    setAviso('')
    try {
      const r = await homologarVitalicio(v.id, oficinaId)
      setAviso(r.aviso ?? `${nome} agora é vitalícia.`)
      await carregar()
      aoMudar()
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  // Quem pode receber uma vaga: oficina que ainda não é vitalícia.
  const candidatas = oficinas.filter((o) => !o.vitalicia).sort((a, b) => a.nome.localeCompare(b.nome))
  const pagas = (lista ?? []).filter((v) => v.situacao === 'paga')
  const reservadas = (lista ?? []).filter((v) => v.situacao === 'reservada')

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 tablet:grid-cols-4">
        <Numero rotulo="Vendidas" valor={`${pagas.length} de 30`} />
        <Numero rotulo="Restam" valor={String(restantes)} />
        <Numero rotulo="Sem oficina ainda" valor={String(pagas.filter((v) => !v.oficina_id).length)} />
        <Numero rotulo="Recebido" valor={dinheiro(pagas.reduce((s, v) => s + Number(v.valor), 0))} />
      </div>

      {erro && <p role="alert" className="rounded-controle bg-erro-fundo px-4 py-3 text-sm text-erro">{erro}</p>}
      {aviso && <p className="rounded-controle bg-sucesso-fundo px-4 py-3 text-sm text-sucesso-forte">{aviso}</p>}

      <div className="overflow-x-auto rounded-card bg-superficie">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-borda-clara">
              {['Comprador', 'Oficina', 'Valor', 'Vendido em', ''].map((t) => (
                <th key={t} className="px-4 py-3 text-sm font-medium text-claro-secundario">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista === null ? (
              <tr><td colSpan={5} className="px-4 py-6 text-sm text-claro-secundario">Carregando…</td></tr>
            ) : lista.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-sm text-claro-secundario">Nenhuma vaga vendida ainda.</td></tr>
            ) : (
              [...pagas, ...reservadas].map((v) => (
                <tr key={v.id} className="border-b border-borda-clara last:border-b-0">
                  <td className="px-4 py-3">
                    <span className="block font-medium text-claro">{v.comprador}</span>
                    <span className="block text-xs text-claro-secundario">
                      {v.email ?? 'sem e-mail'} · {v.origem === 'app' ? 'comprou no app' : 'venda fora do app'}
                    </span>
                    {v.situacao === 'reservada' && (
                      <span className="mt-1 inline-block rounded-badge bg-atencao-fundo px-2 py-0.5 text-xs font-medium text-atencao-forte">
                        Pagando — vaga reservada até {v.reservada_ate ? new Date(v.reservada_ate).toLocaleString('pt-BR') : '—'}
                      </span>
                    )}
                    {v.observacao?.includes('conferir') && (
                      <span className="mt-1 block text-xs font-semibold text-erro-forte">{v.observacao}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-claro">
                    {v.oficinas?.nome ?? (
                      v.situacao === 'paga' ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <select
                            value={ligando[v.id] ?? ''}
                            onChange={(e) => setLigando((a) => ({ ...a, [v.id]: e.target.value }))}
                            aria-label={`Oficina de ${v.comprador}`}
                            className="h-9 max-w-[14rem] rounded-controle border border-borda-clara px-2 text-sm text-claro"
                          >
                            <option value="">Ainda sem oficina…</option>
                            {candidatas.map((o) => (
                              <option key={o.id} value={o.id}>{o.nome}{o.cidade ? ` — ${o.cidade}` : ''}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={!ligando[v.id]}
                            onClick={() => void homologar(v)}
                            className="h-9 rounded-controle bg-acento px-3 text-sm font-semibold text-claro disabled:opacity-40"
                          >
                            Homologar
                          </button>
                        </span>
                      ) : '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-claro">{dinheiro(Number(v.valor))}</td>
                  <td className="px-4 py-3 text-sm text-claro">{data(v.vendido_em)}</td>
                  <td />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <form onSubmit={registrar} className="grid gap-4 rounded-card bg-superficie p-6 tablet:grid-cols-[2fr_2fr_1fr_auto] tablet:items-end">
        <div className="tablet:col-span-4">
          <h2 className="text-lg font-semibold text-claro">Registrar venda feita fora do app</h2>
          <p className="text-sm text-claro-secundario">
            Para quem já pagou e ainda não se cadastrou. A vaga fica guardada no nome; quando a oficina
            aparecer na lista, use "Homologar" acima.
          </p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-claro-secundario">Nome de quem comprou</span>
          <input required minLength={2} value={comprador} onChange={(e) => setComprador(e.target.value)}
            className="h-11 rounded-controle border border-borda-clara px-3 text-claro" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-claro-secundario">E-mail (opcional)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="h-11 rounded-controle border border-borda-clara px-3 text-claro" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-claro-secundario">Valor pago</span>
          <input inputMode="decimal" required value={valor} onChange={(e) => setValor(e.target.value)}
            className="h-11 rounded-controle border border-borda-clara px-3 text-claro" />
        </label>
        <button type="submit" disabled={salvando || restantes <= 0}
          className="h-11 rounded-controle bg-acento px-5 text-sm font-semibold text-claro disabled:opacity-50">
          {salvando ? 'Registrando…' : 'Registrar'}
        </button>
      </form>
    </div>
  )
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-card bg-superficie p-4">
      <p className="text-xs text-claro-secundario">{rotulo}</p>
      <p className="pt-1 text-2xl font-bold text-claro">{valor}</p>
    </div>
  )
}
