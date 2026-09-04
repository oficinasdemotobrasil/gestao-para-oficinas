import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileText, Plus } from 'lucide-react'
import { Tela, CabecalhoTela } from '@/componentes/layout/Tela'
import { CampoBusca } from '@/componentes/ui/CampoBusca'
import { Abas } from '@/componentes/ui/Abas'
import { Filtros } from '@/componentes/ui/Filtros'
import { LinhaLista } from '@/componentes/ui/Card'
import { ListaResponsiva } from '@/componentes/ui/ListaResponsiva'
import { Botao } from '@/componentes/ui/Botao'
import { EstadoVazio, EstadoErro } from '@/componentes/ui/EstadoVazio'
import { EsqueletoLista } from '@/componentes/ui/Carregando'
import { useDebounce } from '@/lib/useDebounce'
import { moeda, exibirPlaca, data } from '@/lib/formato'
import type { StatusOrcamento } from '@/tipos/banco'
import { listarOrcamentos, statusEfetivo } from '../api'
import { StatusOrcamentoBadge } from '../StatusOrcamentoBadge'

const filtros = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'rascunho', rotulo: 'Rascunho' },
  { id: 'enviado', rotulo: 'Enviados' },
  { id: 'aprovado', rotulo: 'Aprovados' },
] as const

export function ListaOrcamentos() {
  const navegar = useNavigate()
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useDebounce(busca)
  const [status, setStatus] = useState<StatusOrcamento | 'todos'>('todos')

  const { data: orcamentos, isPending, isError, refetch } = useQuery({
    queryKey: ['orcamentos', buscaAtrasada, status],
    queryFn: () => listarOrcamentos({ busca: buscaAtrasada, status }),
  })

  const buscando = busca.trim().length > 0

  return (
    <Tela>
      <CabecalhoTela
        titulo="Orçamentos"
        contexto={
          orcamentos
            ? `${orcamentos.length} ${orcamentos.length === 1 ? 'orçamento' : 'orçamentos'}`
            : 'Monte, envie e aprove'
        }
      />

      <Filtros
        // A busca aceita os três jeitos de procurar um orçamento: pelo número
        // que o cliente cita no telefone, pelo nome dele, ou pela placa da moto
        // que está na frente.
        busca={
          <CampoBusca
            rotulo="Buscar por número, cliente ou placa"
            valor={busca}
            aoMudar={setBusca}
            placeholder="Número, cliente ou placa"
          />
        }
        abas={
          <Abas rotulo="Situação do orçamento" abas={filtros} ativa={status} aoTrocar={setStatus} />
        }
        acoes={
          <Botao
            largo
            compactoNoDesktop
            icone={<Plus aria-hidden size={20} />}
            onClick={() => navegar('/orcamentos/novo')}
          >
            Novo orçamento
          </Botao>
        }
      />

      <div className="pt-6">
        {isPending ? (
          <EsqueletoLista />
        ) : isError ? (
          <EstadoErro
            titulo="Não foi possível carregar os orçamentos"
            descricao="Verifique a conexão e toque em tentar de novo."
            aoTentarDeNovo={() => void refetch()}
          />
        ) : orcamentos.length === 0 ? (
          <EstadoVazio
            icone={<FileText aria-hidden size={28} />}
            titulo={buscando ? 'Nenhum orçamento encontrado' : 'Nenhum orçamento ainda'}
            descricao={
              buscando
                ? `Nada com "${busca}". Confira o número, o nome ou a placa.`
                : 'Monte o primeiro orçamento e mande para o cliente pelo WhatsApp.'
            }
            rotuloAcao={buscando ? undefined : 'Novo orçamento'}
            aoAgir={buscando ? undefined : () => navegar('/orcamentos/novo')}
          />
        ) : (
          <ListaResponsiva
            descricao="Orçamentos da oficina"
            itens={orcamentos}
            chaveDoItem={(o) => o.id}
            aoTocar={(o) => navegar(`/orcamentos/${o.id}`)}
            // O cartão do celular é o mesmo de sempre, linha por linha.
            cartao={(o) => (
              <LinhaLista
                inicio={
                  <span className="flex h-10 min-w-[52px] items-center justify-center rounded-badge bg-acento-suave px-2 text-rotulo font-semibold text-claro">
                    {String(o.numero).padStart(3, '0')}
                  </span>
                }
                titulo={o.cliente?.nome ?? 'Cliente removido'}
                descricao={`${o.moto ? exibirPlaca(o.moto.placa) : 'sem moto'} · ${moeda(o.valor_total)} · ${data(o.criado_em)}`}
                fim={<StatusOrcamentoBadge status={statusEfetivo(o)} />}
                aoTocar={() => navegar(`/orcamentos/${o.id}`)}
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
              { chave: 'cliente', titulo: 'Cliente', celula: (o) => o.cliente?.nome ?? 'Cliente removido' },
              {
                chave: 'moto',
                titulo: 'Moto',
                celula: (o) => (o.moto ? exibirPlaca(o.moto.placa) : '—'),
              },
              {
                chave: 'data',
                titulo: 'Criado em',
                peso: 'apoio',
                celula: (o) => data(o.criado_em),
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
                largura: 'w-32',
                celula: (o) => <StatusOrcamentoBadge status={statusEfetivo(o)} />,
              },
            ]}
          />
        )}
      </div>
    </Tela>
  )
}
