import { useCallback, useState } from 'react'
import { Package, Plus, Trash2 } from 'lucide-react'
import { Campo } from '@/componentes/ui/Campo'
import { FolhaDeBusca, type OpcaoDeBusca } from '@/componentes/ui/FolhaDeBusca'
import { Contador } from '@/componentes/ui/Contador'
import { moeda } from '@/lib/formato'
import { paraNumero } from '@/lib/numero'
import { usePermissoes } from '@/auth/usePermissoes'
import { listarProdutos } from '@/funcionalidades/produtos/api'
import type { ItemEntradaEmEdicao } from './api'

interface Props {
  itens: ItemEntradaEmEdicao[]
  aoMudar: (itens: ItemEntradaEmEdicao[]) => void
}

const novaChave = () => Math.random().toString(36).slice(2)

/**
 * As peças que a nota trouxe. É a mesma peça-a-peça do orçamento, com uma
 * diferença: aqui o número é o que a oficina PAGOU (custo), não o preço de
 * venda — é o que vira o custo médio do produto e a base do lucro depois.
 */
export function ItensDaNotaEntrada({ itens, aoMudar }: Props) {
  const p = usePermissoes()
  const [escolhendo, setEscolhendo] = useState(false)

  const buscarProdutos = useCallback(
    async (termo: string): Promise<OpcaoDeBusca[]> => {
      const lista = await listarProdutos(termo, p.verCusto)
      return lista.map((x) => ({
        id: `${x.id}|${x.nome}|${x.preco_custo ?? 0}`,
        titulo: x.nome,
        descricao: `${x.estoque_atual} ${x.unidade} em estoque hoje`,
      }))
    },
    [p.verCusto],
  )

  function adicionar(chaveComposta: string) {
    const [id, nome, custo] = chaveComposta.split('|')
    aoMudar([
      ...itens,
      { chave: novaChave(), produto_id: id, produto_nome: nome, quantidade: 1, custo_unitario: Number(custo) || null },
    ])
    setEscolhendo(false)
  }

  function alterar(chave: string, mudanca: Partial<ItemEntradaEmEdicao>) {
    aoMudar(itens.map((i) => (i.chave === chave ? { ...i, ...mudanca } : i)))
  }

  function remover(chave: string) {
    aoMudar(itens.filter((i) => i.chave !== chave))
  }

  const total = itens.reduce((acc, i) => acc + i.quantidade * (i.custo_unitario ?? 0), 0)

  return (
    <div className="flex flex-col gap-3">
      {itens.length > 0 && (
        <div className="flex flex-col gap-3">
          {itens.map((item) => (
            <div key={item.chave} className="rounded-card bg-superficie p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate text-corpo font-medium text-em-superficie">
                  {item.produto_nome ?? 'Peça'}
                </p>
                <button
                  type="button"
                  onClick={() => remover(item.chave)}
                  aria-label={`Remover ${item.produto_nome ?? 'item'}`}
                  className="-mr-2 -mt-1 flex h-toque w-toque shrink-0 items-center justify-center text-erro-forte"
                >
                  <Trash2 aria-hidden size={18} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3">
                <Contador
                  rotulo="Quantidade"
                  valor={String(item.quantidade).replace('.', ',')}
                  aoMudar={(v) => alterar(item.chave, { quantidade: paraNumero(v) || 0 })}
                />
                <Campo
                  rotulo="Custo unitário"
                  inputMode="decimal"
                  value={item.custo_unitario != null ? String(item.custo_unitario).replace('.', ',') : ''}
                  onChange={(e) =>
                    alterar(item.chave, { custo_unitario: e.target.value === '' ? null : paraNumero(e.target.value) })
                  }
                />
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-borda-em-superficie pt-3">
                <span className="text-rotulo text-em-superficie-2">Subtotal</span>
                <span className="text-corpo font-semibold text-em-superficie">
                  {moeda(item.quantidade * (item.custo_unitario ?? 0))}
                </span>
              </div>
            </div>
          ))}

          <div className="flex items-baseline justify-between gap-4 rounded-card bg-fundo-2 px-4 py-3 text-em-fundo">
            <span className="text-rotulo text-em-fundo-2">Total da nota</span>
            <span className="text-corpo font-semibold">{moeda(total)}</span>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setEscolhendo(true)}
        className="flex min-h-toque items-center justify-center gap-2 rounded-card border border-borda-em-fundo text-em-fundo active:bg-fundo-2"
      >
        <Plus aria-hidden size={16} />
        <Package aria-hidden size={18} />
        <span className="text-rotulo font-medium">Adicionar peça</span>
      </button>

      <FolhaDeBusca
        aberto={escolhendo}
        aoFechar={() => setEscolhendo(false)}
        titulo="Escolher peça"
        placeholder="Nome ou código"
        buscar={buscarProdutos}
        aoEscolher={adicionar}
        vazio={{
          titulo: 'Nenhuma peça no catálogo',
          descricao: 'Cadastre o produto em Catálogo antes de lançar a nota.',
        }}
      />
    </div>
  )
}
