import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { TriangleAlert, ChevronRight } from 'lucide-react'
import { TituloSecao } from '@/componentes/layout/Tela'
import { Card } from '@/componentes/ui/Card'
import { Abas } from '@/componentes/ui/Abas'
import { Campo } from '@/componentes/ui/Campo'
import { EstadoErro } from '@/componentes/ui/EstadoVazio'
import { EsqueletoLista } from '@/componentes/ui/Carregando'
import { moeda, porcentagem } from '@/lib/formato'
import { duracao } from '@/funcionalidades/ordens/Cronometro'
import { LinhaDoPeriodo, BarraDeComposicao } from './Graficos'
import { obterPainel, datasDoPeriodo, type Periodo } from './api'

const periodos = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: '7dias', rotulo: '7 dias' },
  { id: 'mes', rotulo: 'Mês' },
  { id: 'personalizado', rotulo: 'Escolher' },
] as const

function Numero({
  rotulo,
  valor,
  detalhe,
  tom,
}: {
  rotulo: string
  valor: string
  detalhe?: string
  tom?: string
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-rotulo text-claro-secundario">{rotulo}</p>
      <p className={`truncate text-secao ${tom ?? 'text-claro'}`}>{valor}</p>
      {detalhe && <p className="truncate text-apoio text-claro-secundario">{detalhe}</p>}
    </div>
  )
}

/**
 * O que o dono olha entre um cliente e outro.
 *
 * Números grandes e poucos: quem abre isto está em pé, com o celular numa mão.
 * Cada bloco responde uma pergunta — quanto do que ofereci virou serviço, o que
 * está na bancada, e o dinheiro do período.
 */
export function Painel() {
  const navegar = useNavigate()
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [personalizado, setPersonalizado] = useState(() => datasDoPeriodo('mes'))

  const datas = periodo === 'personalizado' ? personalizado : datasDoPeriodo(periodo)

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['painel', datas.de, datas.ate],
    queryFn: () => obterPainel(datas.de, datas.ate),
  })

  return (
    <>
      <TituloSecao>Como vai a oficina</TituloSecao>

      <div className="flex flex-col gap-3">
        <Abas rotulo="Período" abas={periodos} ativa={periodo} aoTrocar={setPeriodo} />
        {periodo === 'personalizado' && (
          <div className="flex gap-3">
            <div className="flex-1">
              <Campo
                rotulo="De"
                type="date"
                value={personalizado.de}
                onChange={(e) => setPersonalizado((p) => ({ ...p, de: e.target.value }))}
              />
            </div>
            <div className="flex-1">
              <Campo
                rotulo="Até"
                type="date"
                value={personalizado.ate}
                onChange={(e) => setPersonalizado((p) => ({ ...p, ate: e.target.value }))}
              />
            </div>
          </div>
        )}
      </div>

      {isPending ? (
        <div className="pt-4">
          <EsqueletoLista linhas={3} />
        </div>
      ) : isError ? (
        <div className="pt-4">
          <EstadoErro
            titulo="Não foi possível carregar os números"
            descricao="Verifique a conexão e tente de novo."
            aoTentarDeNovo={() => void refetch()}
          />
        </div>
      ) : (
        // Um cartão por linha no celular, dois no tablet, três no computador.
        // Os números do painel se leem em paralelo — quanto entrou, quanto está
        // na bancada, quanto falta receber —, e empilhados num monitor largo
        // eles viram uma coluna fina que obriga a rolar para comparar.
        <div className="flex flex-col gap-3 pt-4 tablet:grid tablet:grid-cols-2 desktop:grid-cols-3 tablet:items-start">
          {/* Orçamento: quanto do que foi oferecido virou serviço ---------- */}
          <Card>
            <div className="flex gap-4">
              <Numero
                rotulo="Conversão"
                valor={data.orcamentos.conversao != null ? porcentagem(data.orcamentos.conversao) : '—'}
                detalhe={`${data.orcamentos.aprovados} de ${data.orcamentos.emitidos} orçamentos`}
              />
              <Numero
                rotulo="Ticket médio"
                valor={moeda(data.orcamentos.ticket_medio)}
                detalhe={`${moeda(data.orcamentos.valor_aprovado)} aprovados`}
              />
            </div>
            <BarraDeComposicao
              partes={[
                { rotulo: 'Aprovados', valor: data.orcamentos.aprovados, classe: 'bg-sucesso' },
                { rotulo: 'Em aberto', valor: data.orcamentos.em_aberto, classe: 'bg-acento' },
                { rotulo: 'Recusados', valor: data.orcamentos.recusados, classe: 'bg-erro' },
              ]}
            />
          </Card>

          {/* Serviço: o que está na bancada ------------------------------- */}
          <Card>
            <div className="flex gap-4">
              <Numero
                rotulo="Na bancada"
                valor={String(data.servicos.em_andamento + data.servicos.abertas)}
                detalhe={
                  data.servicos.aguardando_conferencia > 0
                    ? `${data.servicos.aguardando_conferencia} esperando conferência`
                    : `${data.servicos.abertas} ainda não começadas`
                }
              />
              <Numero
                rotulo="Concluídas"
                valor={String(data.servicos.finalizadas)}
                detalhe={moeda(data.servicos.valor_finalizado)}
              />
            </div>
            {data.servicos.horas_medias > 0 && (
              <p className="border-t border-borda-clara pt-3 mt-3 text-apoio text-claro-secundario">
                Da abertura à conclusão: {duracao(data.servicos.horas_medias * 60)} em média
              </p>
            )}
          </Card>

          {/* Faturamento dia a dia ---------------------------------------- */}
          {/* Duas colunas, e não três: a linha é desenhada esticada na largura
              disponível, e ocupando o monitor inteiro um único dia de movimento
              vira um pico absurdo em vez de um gráfico. */}
          <Card className="tablet:col-span-2">
            <p className="text-rotulo text-claro-secundario">Serviço concluído por dia</p>
            <LinhaDoPeriodo pontos={data.evolucao} />
          </Card>

          {/* Dinheiro ------------------------------------------------------ */}
          {/* Duas colunas: numa só, em 1024px, a coluna fica com 230px e o
              saldo — que é escrito no corpo maior do app, 40px — vazava para
              fora do cartão. Encolher o número seria esconder o que a pessoa
              abriu o painel para ver. */}
          <Card className="desktop:col-span-2">
            <div className="flex gap-4">
              <Numero rotulo="A receber" valor={moeda(data.financeiro.a_receber)} />
              <Numero rotulo="A pagar" valor={moeda(data.financeiro.a_pagar)} />
            </div>
            {data.financeiro.em_atraso > 0 && (
              <p className="pt-3 text-corpo text-erro">
                {moeda(data.financeiro.em_atraso)} vencidos e não recebidos
              </p>
            )}
            <div className="flex items-baseline justify-between gap-4 border-t border-borda-clara pt-3 mt-3">
              <span className="text-secao text-claro">Saldo previsto</span>
              <span
                className={`text-destaque ${
                  data.financeiro.a_receber - data.financeiro.a_pagar < 0 ? 'text-erro' : 'text-claro'
                }`}
              >
                {moeda(data.financeiro.a_receber - data.financeiro.a_pagar)}
              </span>
            </div>
          </Card>

          {/* Quem fez o quê ------------------------------------------------ */}
          {data.ranking.length > 0 && (
            <Card className="tablet:col-span-2 desktop:col-span-1">
              <p className="pb-2 text-rotulo text-claro-secundario">Serviços concluídos por pessoa</p>
              {data.ranking.map((r) => (
                <div
                  key={r.nome}
                  className="flex items-baseline justify-between gap-4 border-b border-borda-clara py-2 last:border-b-0"
                >
                  <span className="min-w-0 truncate text-corpo text-claro">{r.nome}</span>
                  <span className="shrink-0 text-apoio text-claro-secundario">
                    {r.ordens} {r.ordens === 1 ? 'ordem' : 'ordens'}
                    {r.minutos > 0 && ` · ${duracao(r.minutos)}`}
                  </span>
                </div>
              ))}
            </Card>
          )}

          {/* Estoque ------------------------------------------------------- */}
          {data.produtos_para_repor > 0 && (
            <button
              type="button"
              onClick={() => navegar('/catalogo')}
              className="flex items-center gap-3 rounded-card bg-atencao-fundo px-4 py-4 text-left tablet:col-span-2 desktop:col-span-3"
            >
              <TriangleAlert aria-hidden size={20} className="shrink-0 text-atencao" />
              <span className="min-w-0 flex-1 text-corpo text-atencao">
                {data.produtos_para_repor}{' '}
                {data.produtos_para_repor === 1 ? 'peça abaixo do mínimo' : 'peças abaixo do mínimo'}
              </span>
              <ChevronRight aria-hidden size={20} className="shrink-0 text-atencao" />
            </button>
          )}
        </div>
      )}
    </>
  )
}
