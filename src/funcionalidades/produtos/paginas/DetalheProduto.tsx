import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Scale, Pencil, TriangleAlert, Boxes } from 'lucide-react'
import { Tela, CabecalhoInterno, TituloSecao } from '@/componentes/layout/Tela'
import { Detalhe } from '@/componentes/layout/Detalhe'
import { Card, ListaCard } from '@/componentes/ui/Card'
import { Botao } from '@/componentes/ui/Botao'
import { Badge, BadgeAtivo } from '@/componentes/ui/Badge'
import { Carregando } from '@/componentes/ui/Carregando'
import { EstadoErro, EstadoVazio } from '@/componentes/ui/EstadoVazio'
import { moeda, quantidade as formatarQuantidade } from '@/lib/formato'
import { usePermissoes } from '@/auth/usePermissoes'
import type { TipoMovimentacao } from '@/tipos/banco'
import { obterProduto } from '../api'
import { ModalMovimentacao } from '@/funcionalidades/estoque/ModalMovimentacao'
import { LinhaMovimentacao } from '@/funcionalidades/estoque/LinhaMovimentacao'
import { listarMovimentacoes } from '@/funcionalidades/estoque/api'

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-rotulo text-claro-secundario">{rotulo}</span>
      <span className="text-corpo text-claro">{valor}</span>
    </div>
  )
}

export function DetalheProduto() {
  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()
  const p = usePermissoes()
  const [movimentando, setMovimentando] = useState<TipoMovimentacao | null>(null)

  const { data: produto, isPending, isError, refetch } = useQuery({
    queryKey: ['produto', id, p.verCusto],
    queryFn: () => obterProduto(id!, p.verCusto),
  })

  const extrato = useQuery({
    queryKey: ['movimentacoes', 'produto', id],
    queryFn: () => listarMovimentacoes({ periodo: 'tudo', tipo: 'todos', produtoId: id }),
    enabled: Boolean(produto),
  })

  if (isPending) return <Carregando />
  if (isError) return <EstadoErro aoTentarDeNovo={() => void refetch()} />
  if (!produto) {
    return (
      <EstadoErro
        titulo="Produto não encontrado"
        descricao="Ele pode ter sido removido. Volte para o catálogo."
        aoTentarDeNovo={() => navegar('/catalogo', { replace: true })}
      />
    )
  }

  const saldo = Number(produto.estoque_atual)
  const minimo = Number(produto.estoque_minimo)
  const precisaRepor = minimo > 0 && saldo <= minimo
  const custo = produto.preco_custo != null ? Number(produto.preco_custo) : null
  const venda = Number(produto.preco_venda)
  const margem = custo != null && custo > 0 && venda > 0 ? ((venda - custo) / venda) * 100 : null

  // Os três botões ficam lado a lado e cada um ocupa um terço da largura: com
  // 375px, isso dá alvos de mais de 100px, que se acerta sem olhar.
  const acoes: Array<{ tipo: TipoMovimentacao; rotulo: string; Icone: typeof ArrowDown }> = [
    { tipo: 'entrada', rotulo: 'Entrada', Icone: ArrowDown },
    { tipo: 'saida', rotulo: 'Saída', Icone: ArrowUp },
    { tipo: 'ajuste', rotulo: 'Ajuste', Icone: Scale },
  ]

  // A coluna de apoio no computador: os primeiros blocos da tela, na ordem em
  // que já estavam no celular.
  const colunaDeApoio = (
    <>
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-rotulo text-claro-secundario">Em estoque</span>
              <span className="text-destaque text-claro">
                {formatarQuantidade(saldo)}
                <span className="pl-2 text-secao font-normal text-claro-secundario">
                  {produto.unidade}
                </span>
              </span>
              {minimo > 0 && (
                <span className="text-apoio text-claro-secundario">
                  Mínimo: {formatarQuantidade(minimo)} {produto.unidade}
                </span>
              )}
            </div>
            {precisaRepor ? (
              <Badge tom="atencao">
                <span className="flex items-center gap-1">
                  <TriangleAlert aria-hidden size={13} />
                  Repor
                </span>
              </Badge>
            ) : (
              <BadgeAtivo ativo={produto.ativo} />
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 pt-5">
            {acoes.map(({ tipo, rotulo, Icone }) => (
              <button
                key={tipo}
                type="button"
                onClick={() => setMovimentando(tipo)}
                className="flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-controle border border-borda-clara text-claro active:bg-borda-clara/50"
              >
                <Icone aria-hidden size={22} />
                <span className="text-rotulo font-medium">{rotulo}</span>
              </button>
            ))}
          </div>
        </Card>

        <TituloSecao>Preços</TituloSecao>
        <Card>
          <Linha rotulo="Preço de venda" valor={moeda(venda)} />
          {/* Custo e margem só existem para quem pode vê-los: para o vendedor,
              estes campos nem chegam do servidor. */}
          {custo != null && <Linha rotulo="Preço de custo" valor={moeda(custo)} />}
          {margem != null && (
            <Linha rotulo="Margem" valor={`${moeda(venda - custo!)} · ${margem.toFixed(0)}%`} />
          )}
          <Linha rotulo="Unidade" valor={produto.unidade} />
        </Card>
    </>
  )

  return (
    <Tela>
      <CabecalhoInterno
        titulo={produto.nome}
        contexto={produto.codigo ?? undefined}
        acao={
          p.editarCatalogo ? (
            <Botao
              variante="contorno"
              className="h-toque px-4"
              icone={<Pencil aria-hidden size={18} />}
              onClick={() => navegar(`/catalogo/produtos/${produto.id}/editar`)}
            >
              Editar
            </Botao>
          ) : undefined
        }
      />

      <Detalhe apoio={colunaDeApoio}>
      {/* O saldo é o que a pessoa veio ver, então ele é o maior número da tela. */}

      <TituloSecao>Extrato</TituloSecao>
      {extrato.isPending ? (
        <Carregando rotulo="Carregando o extrato…" />
      ) : extrato.isError ? (
        <EstadoErro
          titulo="Não foi possível carregar o extrato"
          descricao="Verifique a conexão e toque em tentar de novo."
          aoTentarDeNovo={() => void extrato.refetch()}
        />
      ) : extrato.data.length === 0 ? (
        <EstadoVazio
          icone={<Boxes aria-hidden size={28} />}
          titulo="Nenhuma movimentação ainda"
          descricao="Toque em Entrada ou Saída acima para registrar a primeira."
        />
      ) : (
        <ListaCard>
          {extrato.data.map((m) => (
            <LinhaMovimentacao key={m.id} movimentacao={m} mostrarProduto={false} />
          ))}
        </ListaCard>
      )}

      {movimentando && (
        <ModalMovimentacao
          aberto
          aoFechar={() => setMovimentando(null)}
          tipo={movimentando}
          produto={{
            id: produto.id,
            nome: produto.nome,
            unidade: produto.unidade,
            estoque_atual: saldo,
          }}
        />
      )}
      </Detalhe>
    </Tela>
  )
}
