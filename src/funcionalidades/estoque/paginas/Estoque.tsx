import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Boxes, TriangleAlert } from 'lucide-react'
import { TituloSecao } from '@/componentes/layout/Tela'
import { Abas } from '@/componentes/ui/Abas'
import { ListaCard } from '@/componentes/ui/Card'
import { EstadoVazio, EstadoErro } from '@/componentes/ui/EstadoVazio'
import { EsqueletoLista } from '@/componentes/ui/Carregando'
import { Badge } from '@/componentes/ui/Badge'
import type { TipoMovimentacao } from '@/tipos/banco'
import { LinhaMovimentacao } from '../LinhaMovimentacao'
import { listarMovimentacoes, produtosParaRepor, type Periodo } from '../api'

const periodos = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: '7dias', rotulo: '7 dias' },
  { id: '30dias', rotulo: '30 dias' },
  { id: 'tudo', rotulo: 'Tudo' },
] as const

const tipos = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'entrada', rotulo: 'Entradas' },
  { id: 'saida', rotulo: 'Saídas' },
  { id: 'ajuste', rotulo: 'Ajustes' },
] as const

/** Aba de estoque dentro do Catálogo: o que entrou e o que saiu. */
export function Estoque() {
  const navegar = useNavigate()
  const [periodo, setPeriodo] = useState<Periodo>('7dias')
  const [tipo, setTipo] = useState<TipoMovimentacao | 'todos'>('todos')

  const movimentacoes = useQuery({
    queryKey: ['movimentacoes', periodo, tipo],
    queryFn: () => listarMovimentacoes({ periodo, tipo }),
  })

  const repor = useQuery({ queryKey: ['repor'], queryFn: produtosParaRepor })

  return (
    <div className="flex flex-col gap-3">
      <Abas rotulo="Período" abas={periodos} ativa={periodo} aoTrocar={setPeriodo} />
      <Abas rotulo="Tipo de movimentação" abas={tipos} ativa={tipo} aoTrocar={setTipo} />

      {repor.data && repor.data.length > 0 && (
        <button
          type="button"
          onClick={() => navegar('/catalogo?repor=1')}
          className="flex items-center gap-3 rounded-card bg-atencao-fundo p-4 text-left active:opacity-90"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-atencao/20 text-atencao">
            <TriangleAlert aria-hidden size={20} />
          </span>
          <span className="flex flex-col">
            <span className="text-corpo font-medium text-claro">
              {repor.data.length}{' '}
              {repor.data.length === 1 ? 'produto para repor' : 'produtos para repor'}
            </span>
            <span className="text-apoio text-claro-secundario">
              No mínimo ou abaixo dele. Toque para ver quais.
            </span>
          </span>
        </button>
      )}

      <div className="pt-3">
        {movimentacoes.isPending ? (
          <EsqueletoLista />
        ) : movimentacoes.isError ? (
          <EstadoErro
            titulo="Não foi possível carregar o estoque"
            descricao="Verifique a conexão e toque em tentar de novo."
            aoTentarDeNovo={() => void movimentacoes.refetch()}
          />
        ) : movimentacoes.data.length === 0 ? (
          <EstadoVazio
            icone={<Boxes aria-hidden size={28} />}
            titulo="Nenhuma movimentação no período"
            descricao="Entradas e saídas de peça aparecem aqui. Abra um produto para lançar a primeira."
          />
        ) : (
          <>
            <TituloSecao
              acao={<Badge>{movimentacoes.data.length}</Badge>}
            >
              Movimentações
            </TituloSecao>
            <ListaCard>
              {movimentacoes.data.map((m) => (
                <LinhaMovimentacao
                  key={m.id}
                  movimentacao={m}
                  aoTocar={() => navegar(`/catalogo/produtos/${m.produto_id}`)}
                />
              ))}
            </ListaCard>
          </>
        )}
      </div>
    </div>
  )
}
