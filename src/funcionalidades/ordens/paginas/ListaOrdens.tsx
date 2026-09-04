import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Wrench, SlidersHorizontal } from 'lucide-react'
import { Tela, CabecalhoTela } from '@/componentes/layout/Tela'
import { CampoBusca } from '@/componentes/ui/CampoBusca'
import { Abas } from '@/componentes/ui/Abas'
import { Filtros } from '@/componentes/ui/Filtros'
import { LinhaLista } from '@/componentes/ui/Card'
import { ListaResponsiva } from '@/componentes/ui/ListaResponsiva'
import { Botao } from '@/componentes/ui/Botao'
import { Campo, Selecao } from '@/componentes/ui/Campo'
import { EstadoVazio, EstadoErro } from '@/componentes/ui/EstadoVazio'
import { EsqueletoLista } from '@/componentes/ui/Carregando'
import { useDebounce } from '@/lib/useDebounce'
import { moeda, exibirPlaca, data } from '@/lib/formato'
import { listarColaboradores } from '@/funcionalidades/colaboradores/api'
import type { StatusOS } from '@/tipos/banco'
import { listarOrdens } from '../api'
import { StatusOsBadge } from '../StatusOsBadge'

const filtros = [
  { id: 'em_aberto', rotulo: 'Em aberto' },
  { id: 'aguardando_conferencia', rotulo: 'Prontas' },
  { id: 'finalizada', rotulo: 'Finalizadas' },
  { id: 'todas', rotulo: 'Todas' },
] as const

export function ListaOrdens() {
  const navegar = useNavigate()
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useDebounce(busca)
  const [status, setStatus] = useState<StatusOS | 'todas' | 'em_aberto'>('em_aberto')
  // Fechado por padrão: no dia a dia a oficina quer ver o que está em aberto,
  // e período e mecânico só aparecem quando alguém está procurando algo.
  const [maisFiltros, setMaisFiltros] = useState(false)
  const [responsavelId, setResponsavelId] = useState<string | 'todos'>('todos')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')

  const equipe = useQuery({
    queryKey: ['colaboradores'],
    queryFn: listarColaboradores,
    enabled: maisFiltros,
  })

  const { data: ordens, isPending, isError, refetch } = useQuery({
    queryKey: ['ordens', buscaAtrasada, status, responsavelId, de, ate],
    queryFn: () => listarOrdens({ busca: buscaAtrasada, status, responsavelId, de, ate }),
  })

  const buscando = busca.trim().length > 0
  const filtrandoAlem = responsavelId !== 'todos' || de !== '' || ate !== ''

  return (
    <Tela>
      <CabecalhoTela
        titulo="Serviços"
        contexto={
          ordens
            ? `${ordens.length} ${ordens.length === 1 ? 'ordem' : 'ordens'}`
            : 'O que está na bancada'
        }
      />

      <Filtros
        busca={
          <CampoBusca
            rotulo="Buscar por número, cliente ou placa"
            valor={busca}
            aoMudar={setBusca}
            placeholder="Número, cliente ou placa"
          />
        }
        abas={<Abas rotulo="Situação da ordem" abas={filtros} ativa={status} aoTrocar={setStatus} />}
        acoes={
          // O botão de abrir os filtros só existe no celular: no desktop eles
          // já estão na tela, e um botão que não esconde nada é ruído.
          <Botao
            variante="contorno"
            largo
            className="desktop:hidden"
            icone={<SlidersHorizontal aria-hidden size={20} />}
            onClick={() => setMaisFiltros((v) => !v)}
          >
            {maisFiltros ? 'Esconder filtros' : filtrandoAlem ? 'Filtros ativos' : 'Mais filtros'}
          </Botao>
        }
        avancados={
          // No celular, atrás do botão. No desktop, sempre visíveis: a tela
          // comporta, e ter de abrir uma gaveta para filtrar por mecânico é um
          // clique a mais em cima de um clique a mais.
          <div className={maisFiltros ? '' : 'hidden desktop:block'}>
            <div className="flex flex-col gap-4 rounded-card bg-superficie p-5 shadow-card desktop:flex-row desktop:items-end desktop:gap-4">
            <Selecao
              rotulo="Mecânico"
              className="desktop:w-64"
              value={responsavelId}
              onChange={(e) => setResponsavelId(e.target.value)}
            >
              <option value="todos">Todos</option>
              {(equipe.data ?? [])
                .filter((c) => c.ativo)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
            </Selecao>

            <div className="flex gap-3 desktop:shrink-0">
              <div className="flex-1">
                <Campo
                  rotulo="De"
                  type="date"
                  value={de}
                  onChange={(e) => setDe(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <Campo
                  rotulo="Até"
                  type="date"
                  value={ate}
                  onChange={(e) => setAte(e.target.value)}
                />
              </div>
            </div>

            {filtrandoAlem && (
              <Botao
                variante="contorno-no-card"
                largo
                compactoNoDesktop
                onClick={() => {
                  setResponsavelId('todos')
                  setDe('')
                  setAte('')
                }}
              >
                Limpar filtros
              </Botao>
            )}
            </div>
          </div>
        }
      />

      <div className="pt-6">
        {isPending ? (
          <EsqueletoLista />
        ) : isError ? (
          <EstadoErro
            titulo="Não foi possível carregar as ordens"
            descricao="Verifique a conexão e toque em tentar de novo."
            aoTentarDeNovo={() => void refetch()}
          />
        ) : ordens.length === 0 ? (
          <EstadoVazio
            icone={<Wrench aria-hidden size={28} />}
            titulo={
              buscando ? 'Nenhuma ordem encontrada' : 'Nenhuma ordem nesta situação'
            }
            descricao={
              buscando
                ? `Nada com "${busca}". Confira o número, o nome ou a placa.`
                : 'A ordem de serviço nasce quando o cliente aprova um orçamento.'
            }
          />
        ) : (
          <ListaResponsiva
            descricao="Ordens de serviço da oficina"
            itens={ordens}
            chaveDoItem={(o) => o.id}
            aoTocar={(o) => navegar(`/ordens/${o.id}`)}
            cartao={(o) => (
              <LinhaLista
                inicio={
                  <span className="flex h-10 min-w-[52px] items-center justify-center rounded-badge bg-acento-suave px-2 text-rotulo font-semibold text-claro">
                    {String(o.numero).padStart(3, '0')}
                  </span>
                }
                titulo={o.moto ? exibirPlaca(o.moto.placa) : 'Moto removida'}
                descricao={`${o.cliente?.nome ?? 'sem cliente'} · ${moeda(o.valor_total)} · ${data(o.data_abertura)}`}
                fim={<StatusOsBadge status={o.status} />}
                aoTocar={() => navegar(`/ordens/${o.id}`)}
              />
            )}
            colunas={[
              {
                chave: 'numero',
                titulo: 'Nº',
                largura: 'w-20',
                celula: (o) => (
                  <span className="font-semibold">{String(o.numero).padStart(3, '0')}</span>
                ),
              },
              {
                chave: 'moto',
                titulo: 'Moto',
                celula: (o) => (
                  <span className="font-medium">
                    {o.moto ? exibirPlaca(o.moto.placa) : 'Moto removida'}
                  </span>
                ),
              },
              { chave: 'cliente', titulo: 'Cliente', celula: (o) => o.cliente?.nome ?? '—' },
              {
                chave: 'abertura',
                titulo: 'Aberta em',
                peso: 'apoio',
                celula: (o) => data(o.data_abertura),
              },
              {
                chave: 'valor',
                titulo: 'Valor',
                alinhar: 'direita',
                largura: 'w-32',
                celula: (o) => <span className="font-semibold">{moeda(o.valor_total)}</span>,
              },
              {
                chave: 'status',
                titulo: 'Situação',
                largura: 'w-40',
                celula: (o) => <StatusOsBadge status={o.status} />,
              },
            ]}
          />
        )}
      </div>
    </Tela>
  )
}
