import type { ReactNode } from 'react'

/**
 * A faixa de busca, filtros e ação que abre as listas.
 *
 * No celular tudo empilha, como sempre foi: a tela é estreita e cada um desses
 * elementos precisa da largura toda para ter alvo de toque decente.
 *
 * Do desktop em diante eles ficam lado a lado. Não é só estética — é o que faz
 * o atendente do balcão trabalhar rápido: buscar, trocar o filtro e criar um
 * registro sem que a lista pule de lugar a cada clique, e sem rolar para achar
 * o que já estava na tela.
 *
 * A busca cresce e o resto ocupa o que precisa: o campo de digitar é o que mais
 * ganha em ser largo.
 */
export function Filtros({
  busca,
  abas,
  acoes,
  avancados,
}: {
  busca: ReactNode
  abas?: ReactNode
  /** Botão principal da tela — "Novo orçamento", "Cadastrar cliente". */
  acoes?: ReactNode
  /**
   * Filtros que no celular ficam atrás de um botão e no desktop aparecem
   * sozinhos. Quem chama decide o que mostrar; aqui só se decide onde.
   */
  avancados?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 desktop:flex-row desktop:items-center">
        <div className="desktop:min-w-0 desktop:flex-1">{busca}</div>
        {abas && <div className="desktop:shrink-0">{abas}</div>}
        {acoes && <div className="desktop:shrink-0">{acoes}</div>}
      </div>
      {avancados}
    </div>
  )
}
