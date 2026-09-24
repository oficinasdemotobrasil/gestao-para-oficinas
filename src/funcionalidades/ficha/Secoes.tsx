/**
 * Os pedaços da ficha completa, usados tanto na tela do cliente quanto na da
 * moto (migration 0064).
 *
 * Existem como peça compartilhada porque as duas telas mostram as mesmas
 * coisas — orçamento, ordem, nota — e escritas duas vezes elas divergiriam no
 * primeiro campo novo. O jeito de descobrir seria alguém notar que a mesma OS
 * aparece diferente em duas telas.
 *
 * Cada lista abre com cinco linhas. O resto já veio na mesma chamada e aparece
 * com um toque: numa moto de dez anos, mostrar tudo de cara é o que faz a
 * ficha demorar justamente para o cliente mais antigo.
 */
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Wrench, Receipt, Package, ChevronDown } from 'lucide-react'
import { Card, ListaCard, LinhaLista, IconeCirculo } from '@/componentes/ui/Card'
import { Badge } from '@/componentes/ui/Badge'
import { TituloSecao } from '@/componentes/layout/Tela'
import { moeda, data, exibirPlaca, diasAte } from '@/lib/formato'
import { StatusOsBadge } from '@/funcionalidades/ordens/StatusOsBadge'
import { StatusOrcamentoBadge } from '@/funcionalidades/orcamentos/StatusOrcamentoBadge'
import type { Database, StatusConta } from '@/tipos/banco'

type FichaCliente = Database['public']['Functions']['ficha_do_cliente']['Returns']
type FichaMoto = Database['public']['Functions']['ficha_da_moto']['Returns']
type Orcamentos = FichaCliente['orcamentos']
type Ordens = FichaCliente['ordens']
type Notas = FichaCliente['notas']

const PRIMEIRAS = 5

/** Mostra as primeiras linhas e abre o resto, que já está na mão. */
function ComVerTodos<T>({
  itens,
  total,
  render,
}: {
  itens: T[]
  total: number
  render: (item: T) => ReactNode
}) {
  const [aberto, setAberto] = useState(false)
  const visiveis = aberto ? itens : itens.slice(0, PRIMEIRAS)
  // `total` é a contagem no banco; `itens` vem cortada em 50. Quando os dois
  // diferem, dizer "ver todos" seria mentira — por isso o texto muda.
  const faltam = total - visiveis.length

  return (
    <>
      <ListaCard>{visiveis.map(render)}</ListaCard>
      {faltam > 0 && !aberto && (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="flex min-h-toque w-full items-center justify-center gap-1.5 text-corpo text-acento-forte"
        >
          Ver {itens.length > PRIMEIRAS ? `mais ${itens.length - PRIMEIRAS}` : 'todos'}
          {total > itens.length ? ` de ${total}` : ''}
          <ChevronDown aria-hidden size={18} />
        </button>
      )}
    </>
  )
}

export function ResumoDaFicha({
  servicos,
  totalGasto,
  ultimoServico,
  emAndamento,
  garantiaAte,
  extra,
}: {
  servicos: number
  totalGasto: number
  ultimoServico: string | null
  emAndamento: number
  garantiaAte?: string | null
  extra?: ReactNode
}) {
  const diasDeGarantia = garantiaAte ? diasAte(garantiaAte) : null

  return (
    <Card>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-rotulo text-em-superficie-2">Serviços feitos</p>
          <p className="text-secao text-em-superficie">{servicos}</p>
          <p className="text-apoio text-em-superficie-2">
            {ultimoServico ? `Último em ${data(ultimoServico)}` : 'Nenhum ainda'}
          </p>
        </div>
        <div>
          <p className="text-rotulo text-em-superficie-2">Total gasto</p>
          <p className="text-secao text-em-superficie">{moeda(totalGasto)}</p>
          {emAndamento > 0 && (
            <p className="text-apoio text-em-superficie-2">
              {emAndamento === 1 ? '1 em andamento' : `${emAndamento} em andamento`}
            </p>
          )}
        </div>
      </div>

      {/* A pergunta que o cliente faz de volta no balcão: "isso não tem
          garantia?". Hoje se responde procurando a OS antiga na mão. */}
      {diasDeGarantia !== null && diasDeGarantia >= 0 && (
        <p className="mt-3 border-t border-borda-em-superficie pt-3 text-corpo text-sucesso-forte">
          Garantia em vigor até {data(garantiaAte!)}
          {diasDeGarantia === 0
            ? ' — vence hoje'
            : diasDeGarantia === 1
              ? ' — falta 1 dia'
              : ` — faltam ${diasDeGarantia} dias`}
        </p>
      )}

      {extra}
    </Card>
  )
}

export function SecaoOrcamentos({ dados }: { dados: Orcamentos }) {
  const navegar = useNavigate()
  if (dados.total === 0) return null

  return (
    <>
      <TituloSecao>Orçamentos ({dados.total})</TituloSecao>
      <ComVerTodos
        itens={dados.itens}
        total={dados.total}
        render={(o) => (
          <LinhaLista
            key={o.id}
            inicio={
              <IconeCirculo>
                <FileText aria-hidden size={20} />
              </IconeCirculo>
            }
            titulo={`Orçamento ${String(o.numero).padStart(3, '0')} · ${moeda(o.valor)}`}
            descricao={`${data(o.data)}${o.historico ? ' · serviço antigo' : ''}`}
            fim={<StatusOrcamentoBadge status={o.status} />}
            aoTocar={() => navegar(`/orcamentos/${o.id}`)}
          />
        )}
      />
    </>
  )
}

export function SecaoOrdens({ dados, comPlaca = false }: { dados: Ordens; comPlaca?: boolean }) {
  const navegar = useNavigate()
  if (dados.total === 0) return null

  return (
    <>
      <TituloSecao>Ordens de serviço ({dados.total})</TituloSecao>
      <ComVerTodos
        itens={dados.itens}
        total={dados.total}
        render={(o) => (
          <LinhaLista
            key={o.id}
            inicio={
              <IconeCirculo>
                <Wrench aria-hidden size={20} />
              </IconeCirculo>
            }
            titulo={`OS ${String(o.numero).padStart(3, '0')} · ${moeda(o.valor)}`}
            descricao={[
              comPlaca && o.placa ? exibirPlaca(o.placa) : null,
              data(o.conclusao ?? o.data),
              o.responsavel,
              o.historico ? 'serviço antigo' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            fim={<StatusOsBadge status={o.status} />}
            aoTocar={() => navegar(`/ordens/${o.id}`)}
          />
        )}
      />
    </>
  )
}

export function SecaoNotas({ dados }: { dados: Notas }) {
  const navegar = useNavigate()
  if (dados.total === 0) return null

  return (
    <>
      <TituloSecao>Notas fiscais ({dados.total})</TituloSecao>
      <ComVerTodos
        itens={dados.itens}
        total={dados.total}
        render={(n) => (
          <LinhaLista
            key={n.id}
            inicio={
              <IconeCirculo>
                <Receipt aria-hidden size={20} />
              </IconeCirculo>
            }
            titulo={`${n.numero ? `Nota ${n.numero}` : 'Nota sem número'} · ${moeda(n.valor)}`}
            descricao={data(n.data)}
            fim={n.status === 'cancelada' ? <Badge tom="erro">Cancelada</Badge> : undefined}
            aoTocar={() => navegar(`/notas-fiscais/saida/${n.id}`)}
          />
        )}
      />
    </>
  )
}

const tomDaConta: Record<StatusConta, 'sucesso' | 'atencao' | 'erro' | 'neutro'> = {
  paga: 'sucesso',
  aberta: 'atencao',
  atrasada: 'erro',
  cancelada: 'neutro',
}

export function SecaoFinanceiro({ dados }: { dados: FichaCliente['financeiro'] }) {
  const navegar = useNavigate()
  // Nulo é plano sem financeiro: a tela some com o bloco, porque mostrar zero
  // seria afirmar que o cliente não deve nada.
  if (!dados) return null

  return (
    <>
      <TituloSecao>Dinheiro</TituloSecao>
      <Card>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-rotulo text-em-superficie-2">Em aberto</p>
            <p
              className={`text-secao ${
                Number(dados.em_atraso) > 0 ? 'text-erro-forte' : 'text-em-superficie'
              }`}
            >
              {moeda(dados.em_aberto)}
            </p>
            {Number(dados.em_atraso) > 0 && (
              <p className="text-apoio text-erro-forte">{moeda(dados.em_atraso)} vencido</p>
            )}
          </div>
          <div>
            <p className="text-rotulo text-em-superficie-2">Já pagou</p>
            <p className="text-secao text-em-superficie">{moeda(dados.recebido)}</p>
          </div>
        </div>
      </Card>

      {dados.contas.length > 0 && (
        <div className="pt-3">
          <ComVerTodos
            itens={dados.contas}
            total={dados.contas.length}
            render={(c) => (
              <LinhaLista
                key={c.id}
                titulo={`${c.descricao} · ${moeda(c.valor)}`}
                descricao={
                  Number(c.valor_recebido) > 0 && Number(c.valor_recebido) < Number(c.valor)
                    ? `Vence ${data(c.vencimento)} · ${moeda(c.valor_recebido)} já pago`
                    : `Vence ${data(c.vencimento)}`
                }
                fim={
                  <Badge tom={tomDaConta[c.status]}>
                    {c.status === 'paga'
                      ? 'Paga'
                      : c.status === 'atrasada'
                        ? 'Atrasada'
                        : c.status === 'cancelada'
                          ? 'Cancelada'
                          : 'Em aberto'}
                  </Badge>
                }
                aoTocar={() => navegar('/financeiro')}
              />
            )}
          />
        </div>
      )}
    </>
  )
}

export function SecaoPecas({ pecas }: { pecas: FichaMoto['pecas'] }) {
  if (pecas.length === 0) return null

  return (
    <>
      <TituloSecao>Peças já trocadas ({pecas.length})</TituloSecao>
      <ComVerTodos
        itens={pecas}
        total={pecas.length}
        render={(p) => (
          <LinhaLista
            key={p.descricao}
            comSeta={false}
            inicio={
              <IconeCirculo>
                <Package aria-hidden size={20} />
              </IconeCirculo>
            }
            titulo={p.descricao}
            descricao={[
              p.ultima_vez ? `Última vez em ${data(p.ultima_vez)}` : null,
              p.vezes > 1 ? `${p.vezes} vezes` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        )}
      />
    </>
  )
}
