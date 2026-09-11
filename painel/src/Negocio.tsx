/**
 * O painel do negócio.
 *
 * Um painel que só mostra totais não serve para nada. Quem administra a
 * plataforma não precisa saber quantas oficinas existem — precisa saber o que
 * fazer hoje. Por isso a primeira coisa da tela é a lista de quem precisa de
 * atenção, e não o número grande.
 */
import {
  dinheiro,
  ROTULO_CALCULADO,
  type PainelDoNegocio,
  type SituacaoCalculada,
} from './plataforma'

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

function Numero({
  rotulo,
  valor,
  detalhe,
  tom,
}: {
  rotulo: string
  valor: string | number
  detalhe?: string
  tom?: 'bom' | 'atencao' | 'ruim'
}) {
  const cor =
    tom === 'bom' ? 'text-sucesso' : tom === 'ruim' ? 'text-erro' : tom === 'atencao' ? 'text-atencao' : 'text-claro'
  return (
    <div className="rounded-card bg-superficie p-4">
      <p className="text-xs text-claro-secundario">{rotulo}</p>
      <p className={`pt-1 text-2xl font-bold tabular-nums ${cor}`}>{valor}</p>
      {detalhe && <p className="text-xs text-claro-secundario">{detalhe}</p>}
    </div>
  )
}

function Secao({ titulo, apoio, children }: { titulo: string; apoio?: string; children: React.ReactNode }) {
  return (
    <section className="pt-8">
      <div className="flex flex-wrap items-baseline gap-3 pb-3">
        <h2 className="text-lg font-semibold text-escuro">{titulo}</h2>
        {apoio && <p className="text-sm text-escuro-secundario">{apoio}</p>}
      </div>
      {children}
    </section>
  )
}

/** Barra de proporção. Serve para comparar tamanhos, não para ler valores. */
function Barra({ parte, todo }: { parte: number; todo: number }) {
  const largura = todo > 0 ? Math.max(2, (parte / todo) * 100) : 0
  return (
    <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-borda-clara">
      <div className="h-full rounded-full bg-acento" style={{ width: `${largura}%` }} />
    </div>
  )
}

export function Negocio({ painel }: { painel: PainelDoNegocio }) {
  const { dinheiro: d, clientes: c } = painel
  const maiorCidade = Math.max(1, ...painel.geografia.map((g) => g.oficinas))

  return (
    <div className="pb-4">
      {/* Quem precisa de atenção vem PRIMEIRO. É a única parte acionável. */}
      {painel.atencao.length > 0 && (
        <Secao titulo="Precisa de atenção" apoio="hoje, em ordem de urgência">
          <ul className="grid gap-2">
            {painel.atencao.map((a) => (
              <li
                key={a.oficina_id + a.motivo}
                className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-superficie px-4 py-3"
              >
                <span className="font-medium text-claro">{a.oficina}</span>
                <span
                  className={`text-sm ${a.urgencia <= 2 ? 'text-erro' : a.urgencia === 3 ? 'text-atencao' : 'text-claro-secundario'}`}
                >
                  {a.motivo}
                </span>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      <Secao titulo="Dinheiro" apoio="receita vem de contrato, não de acesso liberado">
        <div className="grid grid-cols-2 gap-3 desktop:grid-cols-4">
          <Numero
            rotulo="Receita recorrente"
            valor={dinheiro(Number(d.receita_recorrente))}
            detalhe="por mês, de quem paga"
            tom="bom"
          />
          <Numero
            rotulo="Em risco"
            valor={dinheiro(Number(d.em_risco))}
            detalhe="atrasadas e bloqueadas"
            tom={Number(d.em_risco) > 0 ? 'ruim' : undefined}
          />
          <Numero
            rotulo="Entrou no mês"
            valor={dinheiro(Number(d.recebido_no_mes))}
            detalhe="cobranças confirmadas"
          />
          <Numero
            rotulo="Ticket médio"
            valor={dinheiro(Number(d.ticket_medio))}
            detalhe="entre quem paga"
          />
        </div>

        <div className="grid gap-2 pt-3">
          {d.por_plano.map((p) => (
            <div key={p.plano} className="rounded-card bg-superficie px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2">
                <span className="font-medium text-claro">{p.plano}</span>
                <span className="text-sm text-claro-secundario">
                  {p.oficinas} {p.oficinas === 1 ? 'oficina' : 'oficinas'} ·{' '}
                  <strong className="text-claro">{dinheiro(Number(p.receita))}</strong>
                </span>
              </div>
              <Barra parte={p.oficinas} todo={Math.max(1, c.total)} />
            </div>
          ))}
        </div>
      </Secao>

      <Secao titulo="Clientes">
        <div className="grid grid-cols-2 gap-3 desktop:grid-cols-4">
          <Numero rotulo="Oficinas" valor={c.total} detalhe={`${c.com_contrato} com contrato`} />
          <Numero rotulo="Novas no mês" valor={c.novas_no_mes} tom="bom" />
          <Numero
            rotulo="Cancelaram no mês"
            valor={c.cancelamentos_no_mes}
            tom={c.cancelamentos_no_mes > 0 ? 'atencao' : undefined}
          />
          <Numero
            rotulo="Já assinaram"
            valor={c.ja_assinaram_alguma_vez}
            detalhe="alguma vez na vida"
          />
        </div>

        <div className="flex flex-wrap gap-2 pt-3">
          {(Object.entries(c.por_situacao) as [SituacaoCalculada, number][]).map(([s, n]) => (
            <span key={s} className="rounded-badge bg-superficie px-3 py-1.5 text-sm text-claro">
              {ROTULO_CALCULADO[s] ?? s}: <strong>{n}</strong>
            </span>
          ))}
        </div>
      </Secao>

      {/* O que elas disseram ao sair. É o que diz o que consertar. */}
      <Secao
        titulo="Por que saíram"
        apoio={painel.cancelamentos.length === 0 ? 'ninguém cancelou ainda' : 'o que disseram ao cancelar'}
      >
        {painel.cancelamentos.length > 0 && (
          <ul className="grid gap-2">
            {painel.cancelamentos.map((x) => (
              <li key={x.oficina + x.quando} className="rounded-card bg-superficie px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-claro">{x.oficina}</span>
                  <span className="text-xs text-claro-secundario">
                    {data(x.quando)} · ficou {x.durou_dias} dias no {x.plano}
                  </span>
                </div>
                <p className="pt-1 text-sm text-claro-secundario">{x.motivo}</p>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Onde elas estão" apoio="cidade como a oficina digitou">
        <div className="grid gap-2">
          {painel.geografia.map((g) => (
            <div key={g.cidade} className="rounded-card bg-superficie px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2">
                <span className="font-medium text-claro">{g.cidade}</span>
                <span className="text-sm text-claro-secundario">
                  {g.oficinas} {g.oficinas === 1 ? 'oficina' : 'oficinas'}
                  {g.pagantes > 0 && ` · ${g.pagantes} pagando`}
                </span>
              </div>
              <Barra parte={g.oficinas} todo={maiorCidade} />
            </div>
          ))}
        </div>
      </Secao>
    </div>
  )
}
