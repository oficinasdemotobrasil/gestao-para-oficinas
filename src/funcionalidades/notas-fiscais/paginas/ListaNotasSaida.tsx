import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Receipt, Plus } from 'lucide-react'
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
import { moeda, data } from '@/lib/formato'
import type { StatusNota } from '@/tipos/banco'
import { listarNotasSaida } from '../api'
import { StatusNotaBadge } from '../StatusNotaBadge'

const filtros = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'lancada', rotulo: 'Lançadas' },
  { id: 'cancelada', rotulo: 'Canceladas' },
] as const

export function ListaNotasSaida() {
  const navegar = useNavigate()
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useDebounce(busca)
  const [status, setStatus] = useState<StatusNota | 'todas'>('todas')

  const { data: notas, isPending, isError, refetch } = useQuery({
    queryKey: ['notas-saida', buscaAtrasada, status],
    queryFn: () => listarNotasSaida({ busca: buscaAtrasada, status }),
  })

  const buscando = busca.trim().length > 0

  return (
    <Tela>
      <CabecalhoTela
        titulo="Notas de saída"
        contexto={notas ? `${notas.length} ${notas.length === 1 ? 'nota' : 'notas'}` : 'Vendas da oficina'}
      />

      <Filtros
        busca={
          <CampoBusca rotulo="Buscar por número" valor={busca} aoMudar={setBusca} placeholder="Número da nota" />
        }
        abas={<Abas rotulo="Situação da nota" abas={filtros} ativa={status} aoTrocar={setStatus} />}
        acoes={
          <Botao
            largo
            compactoNoDesktop
            icone={<Plus aria-hidden size={20} />}
            onClick={() => navegar('/notas-fiscais/saida/nova')}
          >
            Nova venda
          </Botao>
        }
      />

      <div className="pt-6">
        {isPending ? (
          <EsqueletoLista />
        ) : isError ? (
          <EstadoErro
            titulo="Não foi possível carregar as notas"
            descricao="Verifique a conexão e toque em tentar de novo."
            aoTentarDeNovo={() => void refetch()}
          />
        ) : notas.length === 0 ? (
          <EstadoVazio
            icone={<Receipt aria-hidden size={28} />}
            titulo={buscando ? 'Nenhuma nota encontrada' : 'Nenhuma venda registrada ainda'}
            descricao={
              buscando
                ? `Nada com "${busca}".`
                : 'Registre uma venda de balcão — o estoque baixa e o cliente entra no Financeiro, juntos.'
            }
            rotuloAcao={buscando ? undefined : 'Nova venda'}
            aoAgir={buscando ? undefined : () => navegar('/notas-fiscais/saida/nova')}
          />
        ) : (
          <ListaResponsiva
            descricao="Notas de saída da oficina"
            itens={notas}
            chaveDoItem={(n) => n.id}
            aoTocar={(n) => navegar(`/notas-fiscais/saida/${n.id}`)}
            cartao={(n) => (
              <LinhaLista
                titulo={n.cliente?.nome ?? 'Sem cliente'}
                descricao={`${n.numero ? `Nº ${n.numero}` : 'Sem número'} · ${moeda(n.valor_total)} · ${data(n.criado_em)}`}
                fim={<StatusNotaBadge status={n.status} />}
                aoTocar={() => navegar(`/notas-fiscais/saida/${n.id}`)}
              />
            )}
            colunas={[
              { chave: 'numero', titulo: 'Número', largura: 'w-28', celula: (n) => n.numero ?? '—' },
              { chave: 'cliente', titulo: 'Cliente', celula: (n) => n.cliente?.nome ?? '—' },
              {
                chave: 'data',
                titulo: 'Data',
                peso: 'apoio',
                largura: 'w-32',
                celula: (n) => data(n.criado_em),
              },
              {
                chave: 'valor',
                titulo: 'Valor',
                alinhar: 'direita',
                largura: 'w-32',
                celula: (n) => <span className="font-semibold">{moeda(n.valor_total)}</span>,
              },
              {
                chave: 'status',
                titulo: 'Situação',
                largura: 'w-32',
                celula: (n) => <StatusNotaBadge status={n.status} />,
              },
            ]}
          />
        )}
      </div>
    </Tela>
  )
}
