import { useCallback, useState } from 'react'
import { Package, Wrench, PenLine, Plus, Trash2 } from 'lucide-react'
import { Botao } from '@/componentes/ui/Botao'
import { Campo } from '@/componentes/ui/Campo'
import { Modal } from '@/componentes/ui/Modal'
import { FolhaDeBusca, type OpcaoDeBusca } from '@/componentes/ui/FolhaDeBusca'
import { Contador } from '@/componentes/ui/Contador'
import { moeda } from '@/lib/formato'
import { paraNumero } from '@/lib/numero'
import { usePermissoes } from '@/auth/usePermissoes'
import { listarProdutos } from '@/funcionalidades/produtos/api'
import { listarServicos } from '@/funcionalidades/servicos/api'
import type { ItemEmEdicao } from './api'

interface Props {
  itens: ItemEmEdicao[]
  aoMudar: (itens: ItemEmEdicao[]) => void
  somenteLeitura?: boolean
}

const novaChave = () => Math.random().toString(36).slice(2)

export function ItensDoOrcamento({ itens, aoMudar, somenteLeitura = false }: Props) {
  const p = usePermissoes()
  const [escolhendo, setEscolhendo] = useState<'produto' | 'servico' | null>(null)
  const [avulso, setAvulso] = useState(false)

  const buscarProdutos = useCallback(
    async (termo: string): Promise<OpcaoDeBusca[]> => {
      const lista = await listarProdutos(termo, p.verCusto)
      return lista
        .filter((x) => x.ativo)
        .map((x) => ({
          id: `${x.id}|${x.nome}|${x.preco_venda}`,
          titulo: x.nome,
          descricao: `${moeda(x.preco_venda)} · ${x.estoque_atual} ${x.unidade} em estoque`,
        }))
    },
    [p.verCusto],
  )

  const buscarServicos = useCallback(async (termo: string): Promise<OpcaoDeBusca[]> => {
    const lista = await listarServicos(termo)
    return lista
      .filter((x) => x.ativo)
      .map((x) => ({
        id: `${x.id}|${x.nome}|${x.preco}`,
        titulo: x.nome,
        descricao: x.tempo_estimado_minutos
          ? `${moeda(x.preco)} · ${x.tempo_estimado_minutos} min`
          : moeda(x.preco),
      }))
  }, [])

  function adicionarDoCatalogo(chaveComposta: string, tipo: 'produto' | 'servico') {
    const [id, nome, preco] = chaveComposta.split('|')
    aoMudar([
      ...itens,
      {
        chave: novaChave(),
        tipo,
        produto_id: tipo === 'produto' ? id : null,
        servico_id: tipo === 'servico' ? id : null,
        descricao: nome,
        quantidade: 1,
        valor_unitario: Number(preco),
      },
    ])
    setEscolhendo(null)
  }

  function alterar(chave: string, mudanca: Partial<ItemEmEdicao>) {
    aoMudar(itens.map((i) => (i.chave === chave ? { ...i, ...mudanca } : i)))
  }

  function remover(chave: string) {
    aoMudar(itens.filter((i) => i.chave !== chave))
  }

  const botoes: Array<{ rotulo: string; Icone: typeof Package; aoTocar: () => void }> = [
    { rotulo: 'Peça', Icone: Package, aoTocar: () => setEscolhendo('produto') },
    { rotulo: 'Serviço', Icone: Wrench, aoTocar: () => setEscolhendo('servico') },
    { rotulo: 'Avulso', Icone: PenLine, aoTocar: () => setAvulso(true) },
  ]

  return (
    <div className="flex flex-col gap-3">
      {itens.length > 0 && (
        <div className="flex flex-col gap-3">
          {itens.map((item) => (
            <div key={item.chave} className="rounded-card bg-superficie p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-corpo font-medium text-claro">{item.descricao}</p>
                  <p className="text-apoio text-claro-secundario">
                    {item.tipo === 'produto' ? 'Peça' : item.tipo === 'servico' ? 'Serviço' : 'Item avulso'}
                  </p>
                </div>
                {!somenteLeitura && (
                  <button
                    type="button"
                    onClick={() => remover(item.chave)}
                    aria-label={`Remover ${item.descricao}`}
                    className="-mr-2 -mt-1 flex h-toque w-toque shrink-0 items-center justify-center text-erro"
                  >
                    <Trash2 aria-hidden size={18} />
                  </button>
                )}
              </div>

              {somenteLeitura ? (
                <div className="flex items-baseline justify-between gap-4 pt-3">
                  <span className="text-apoio text-claro-secundario">
                    {item.quantidade} × {moeda(item.valor_unitario)}
                  </span>
                  <span className="text-corpo font-semibold text-claro">
                    {moeda(item.quantidade * item.valor_unitario)}
                  </span>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 pt-3">
                    <Contador
                      rotulo="Quantidade"
                      valor={String(item.quantidade).replace('.', ',')}
                      aoMudar={(v) => alterar(item.chave, { quantidade: paraNumero(v) || 0 })}
                    />
                    <Campo
                      rotulo="Valor unitário"
                      inputMode="decimal"
                      value={String(item.valor_unitario).replace('.', ',')}
                      onChange={(e) =>
                        alterar(item.chave, { valor_unitario: paraNumero(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="flex items-baseline justify-between gap-4 border-t border-borda-clara pt-3 mt-3">
                    <span className="text-rotulo text-claro-secundario">Subtotal</span>
                    <span className="text-corpo font-semibold text-claro">
                      {moeda(item.quantidade * item.valor_unitario)}
                    </span>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {!somenteLeitura && (
        <div className="grid grid-cols-3 gap-2">
          {botoes.map(({ rotulo, Icone, aoTocar }) => (
            <button
              key={rotulo}
              type="button"
              onClick={aoTocar}
              className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-card border border-borda-escura text-escuro active:bg-superficie-escura"
            >
              <span className="flex items-center gap-1">
                <Plus aria-hidden size={14} />
                <Icone aria-hidden size={18} />
              </span>
              <span className="text-rotulo font-medium">{rotulo}</span>
            </button>
          ))}
        </div>
      )}

      <FolhaDeBusca
        aberto={escolhendo === 'produto'}
        aoFechar={() => setEscolhendo(null)}
        titulo="Escolher peça"
        placeholder="Nome ou código"
        buscar={buscarProdutos}
        aoEscolher={(id) => adicionarDoCatalogo(id, 'produto')}
        vazio={{
          titulo: 'Nenhuma peça no catálogo',
          descricao: 'Cadastre em Catálogo, ou use "Avulso" para digitar na hora.',
        }}
      />

      <FolhaDeBusca
        aberto={escolhendo === 'servico'}
        aoFechar={() => setEscolhendo(null)}
        titulo="Escolher serviço"
        placeholder="Nome do serviço"
        buscar={buscarServicos}
        aoEscolher={(id) => adicionarDoCatalogo(id, 'servico')}
        vazio={{
          titulo: 'Nenhum serviço no catálogo',
          descricao: 'Cadastre em Catálogo, ou use "Avulso" para digitar na hora.',
        }}
      />

      <ModalAvulso
        aberto={avulso}
        aoFechar={() => setAvulso(false)}
        aoAdicionar={(descricao, valor) => {
          aoMudar([
            ...itens,
            {
              chave: novaChave(),
              tipo: 'avulso',
              produto_id: null,
              servico_id: null,
              descricao,
              quantidade: 1,
              valor_unitario: valor,
            },
          ])
          setAvulso(false)
        }}
      />
    </div>
  )
}

/**
 * Item que não está no catálogo: "solda no escapamento", "peça que o cliente
 * trouxe". Sem isso, orçar uma vez obrigaria a cadastrar um serviço para sempre.
 */
function ModalAvulso({
  aberto,
  aoFechar,
  aoAdicionar,
}: {
  aberto: boolean
  aoFechar: () => void
  aoAdicionar: (descricao: string, valor: number) => void
}) {
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  function confirmar() {
    if (descricao.trim().length < 2) return setErro('Escreva o que é este item.')
    const n = paraNumero(valor)
    if (!Number.isFinite(n) || n <= 0) return setErro('Informe o valor.')
    aoAdicionar(descricao.trim(), n)
    setDescricao('')
    setValor('')
    setErro(null)
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Item avulso"
      rodape={
        <Botao largo onClick={confirmar}>
          Adicionar ao orçamento
        </Botao>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <Campo
          rotulo="O que é"
          obrigatorio
          autoFocus
          autoCapitalize="sentences"
          placeholder="Solda no escapamento"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
        <Campo
          rotulo="Valor"
          obrigatorio
          inputMode="decimal"
          placeholder="80,00"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
        {erro && (
          <p role="alert" className="rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro">
            {erro}
          </p>
        )}
      </div>
    </Modal>
  )
}
