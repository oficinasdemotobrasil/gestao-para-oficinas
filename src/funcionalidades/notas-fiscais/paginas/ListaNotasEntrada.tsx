import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Truck, Plus } from 'lucide-react'
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
import { listarNotasEntrada } from '../api'
import { StatusNotaBadge } from '../StatusNotaBadge'

const filtros = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'lancada', rotulo: 'Lançadas' },
  { id: 'cancelada', rotulo: 'Canceladas' },
] as const

/**
 * A lista de notas de entrada. Não é uma tela inteira: mora dentro da aba
 * "Entrada" de Notas fiscais, então não traz cabeçalho nem <Tela> próprios —
 * quem cuida disso é a página que a contém.
 */
export function ListaNotasEntrada() {
  const navegar = useNavigate()
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useDebounce(busca)
  const [status, setStatus] = useState<StatusNota | 'todas'>('todas')

  const { data: notas, isPending, isError, refetch } = useQuery({
    queryKey: ['notas-entrada', buscaAtrasada, status],
    queryFn: () => listarNotasEntrada({ busca: buscaAtrasada, status }),
  })

  const buscando = busca.trim().length > 0

  return (
    <>
      <Filtros
        busca={
          <CampoBusca
            rotulo="Buscar por número ou fornecedor"
            valor={busca}
            aoMudar={setBusca}
            placeholder="Número ou fornecedor"
          />
        }
        abas={<Abas rotulo="Situação da nota" abas={filtros} ativa={status} aoTrocar={setStatus} />}
        acoes={
          <Botao
            largo
            compactoNoDesktop
            icone={<Plus aria-hidden size={20} />}
            onClick={() => navegar('/notas-fiscais/entrada/nova')}
          >
            Lançar nota
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
            icone={<Truck aria-hidden size={28} />}
            titulo={buscando ? 'Nenhuma nota encontrada' : 'Nenhuma nota lançada ainda'}
            descricao={
              buscando
                ? `Nada com "${busca}". Confira o número ou o fornecedor.`
                : 'Lance a nota da última compra: as peças entram no estoque e a dívida vai para o Financeiro, juntas.'
            }
            rotuloAcao={buscando ? undefined : 'Lançar nota'}
            aoAgir={buscando ? undefined : () => navegar('/notas-fiscais/entrada/nova')}
          />
        ) : (
          <ListaResponsiva
            descricao="Notas de entrada da oficina"
            itens={notas}
            chaveDoItem={(n) => n.id}
            aoTocar={(n) => navegar(`/notas-fiscais/entrada/${n.id}`)}
            cartao={(n) => (
              <LinhaLista
                titulo={n.fornecedor ?? 'Sem fornecedor'}
                descricao={`Nº ${n.numero} · ${moeda(n.valor_total)} · ${n.data_emissao ? data(n.data_emissao) : '—'}`}
                fim={<StatusNotaBadge status={n.status} />}
                aoTocar={() => navegar(`/notas-fiscais/entrada/${n.id}`)}
              />
            )}
            colunas={[
              { chave: 'numero', titulo: 'Número', largura: 'w-28', celula: (n) => n.numero },
              { chave: 'fornecedor', titulo: 'Fornecedor', celula: (n) => n.fornecedor ?? '—' },
              {
                chave: 'data',
                titulo: 'Emissão',
                peso: 'apoio',
                largura: 'w-32',
                celula: (n) => (n.data_emissao ? data(n.data_emissao) : '—'),
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
    </>
  )
}
