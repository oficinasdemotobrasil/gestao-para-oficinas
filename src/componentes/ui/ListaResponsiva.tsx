import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { ListaCard } from './Card'

export interface Coluna<T> {
  /** Identifica a coluna. Não aparece na tela. */
  chave: string
  titulo: string
  celula: (item: T) => ReactNode
  alinhar?: 'esquerda' | 'direita'
  /** Largura fixa em classe Tailwind, para a tabela não dançar entre páginas. */
  largura?: string
  /**
   * 'apoio' some no tablet e volta no desktop amplo. Serve para o que ajuda mas
   * não é o motivo de a pessoa estar olhando a lista.
   */
  peso?: 'principal' | 'apoio'
}

interface Props<T> {
  itens: T[]
  chaveDoItem: (item: T) => string
  colunas: Array<Coluna<T>>
  /**
   * O cartão do celular, escrito por quem chama.
   *
   * Não é gerado a partir das colunas de propósito: cada lista arruma o cartão
   * do seu jeito — a de ordens põe a placa em cima, a de contas põe o
   * vencimento — e derivar isso de uma tabela daria um cartão morno em todas.
   * Além disso é o que garante que o celular não mude: o markup continua sendo
   * o mesmo de antes.
   */
  cartao: (item: T) => ReactNode
  aoTocar?: (item: T) => void
  /** Rótulo de leitor de tela para a tabela. */
  descricao: string
  /**
   * Como os itens se agrupam no celular.
   *
   * 'lista' é um card branco só, com divisórias entre as linhas — o formato de
   * quase todas as listas do app. 'cartoes' são cards separados com respiro
   * entre eles, usado onde cada item tem ações próprias, como no financeiro.
   *
   * Existe porque converter uma lista para o outro formato mudaria a cara dela
   * no celular, e o celular não muda nesta fase.
   */
  formatoNoCelular?: 'lista' | 'cartoes'
}

/**
 * A mesma lista em dois formatos: cartões empilhados no celular, tabela no
 * desktop.
 *
 * A tabela entra só a partir de 1024px. No tablet ainda são cartões — em 768px
 * uma tabela de cinco colunas já aperta o suficiente para ficar pior do que o
 * cartão, e o ganho de varrer com o olho só aparece quando cabem as colunas
 * todas.
 */
export function ListaResponsiva<T>({
  itens,
  chaveDoItem,
  colunas,
  cartao,
  aoTocar,
  descricao,
  formatoNoCelular = 'lista',
}: Props<T>) {
  // Fragment e não uma <div> em volta: o ListaCard desenha as divisórias com
  // um seletor de filho direto (`> * + *`), e um elemento a mais no meio
  // receberia a borda no lugar da linha — ou nenhuma, se ele fosse
  // `display: contents`.
  const noCelular = itens.map((item) => (
    <Fragment key={chaveDoItem(item)}>{cartao(item)}</Fragment>
  ))

  return (
    <>
      {/* Celular e tablet: exatamente o markup que já existia. */}
      <div className="desktop:hidden">
        {formatoNoCelular === 'lista' ? (
          <ListaCard>{noCelular}</ListaCard>
        ) : (
          <div className="flex flex-col gap-3">{noCelular}</div>
        )}
      </div>

      {/* Desktop: a mesma informação em colunas.
          A rolagem horizontal fica DENTRO do card. Uma tabela com sete colunas
          e dois botões não cabe em 1024px, e sem isto ela empurrava a página
          inteira para o lado — o menu lateral saía do lugar e a tela toda
          passava a rolar de lado. Melhor a tabela rolar sozinha. */}
      <div className="hidden overflow-x-auto rounded-card bg-superficie shadow-card desktop:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{descricao}</caption>
          <thead>
            <tr className="border-b border-borda-clara">
              {colunas.map((c) => (
                <th
                  key={c.chave}
                  scope="col"
                  className={cn(
                    // Cabeçalho que acompanha a rolagem: numa lista de 200
                    // linhas, sem isto a pessoa esquece o que é cada coluna.
                    'sticky top-0 z-10 bg-superficie px-4 py-3 text-rotulo font-medium text-claro-secundario',
                    c.alinhar === 'direita' && 'text-right',
                    c.largura,
                    c.peso === 'apoio' && 'hidden amplo:table-cell',
                  )}
                >
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => (
              <tr
                key={chaveDoItem(item)}
                onClick={aoTocar ? () => aoTocar(item) : undefined}
                // A linha inteira é clicável, mas o teclado precisa de um alvo
                // de verdade: a primeira célula carrega um botão invisível.
                className={cn(
                  'border-b border-borda-clara last:border-b-0',
                  aoTocar && 'cursor-pointer transition-colors duration-padrao hover:bg-borda-clara/40',
                )}
              >
                {colunas.map((c, i) => (
                  <td
                    key={c.chave}
                    className={cn(
                      'px-4 py-3 text-corpo text-claro',
                      c.alinhar === 'direita' && 'text-right',
                      c.peso === 'apoio' && 'hidden amplo:table-cell',
                    )}
                  >
                    {i === 0 && aoTocar ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          // A linha já trata o clique; sem isto ele contaria duas vezes.
                          e.stopPropagation()
                          aoTocar(item)
                        }}
                        className="rounded-controle text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
                      >
                        {c.celula(item)}
                      </button>
                    ) : (
                      c.celula(item)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
