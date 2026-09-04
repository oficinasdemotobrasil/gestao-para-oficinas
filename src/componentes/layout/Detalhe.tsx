import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Tela de detalhe em duas colunas, a partir de 1024px.
 *
 * Esquerda: o conteúdo que se lê e se rola — itens, resumo, histórico.
 * Direita: de quem é, de que moto é, e o que dá para fazer. Ela acompanha a
 * rolagem, porque numa ordem de serviço comprida a pessoa não deveria voltar ao
 * topo para lembrar de que moto se trata ou para achar o botão.
 *
 * No celular são duas caixas empilhadas, sem grade e sem `sticky` — ou seja,
 * exatamente o que já existia.
 *
 * **O bloco de apoio é o começo da tela, não uma seleção espalhada.** Quem usa
 * este componente passa em `apoio` os primeiros blocos da ordem que já existe no
 * celular, e o resto vai em `children`. Assim a ordem do celular sai de graça,
 * sem `order` nem truque de CSS: no celular a caixa de apoio simplesmente vem
 * primeiro, como já vinha.
 */
export function Detalhe({
  apoio,
  children,
  className,
}: {
  apoio: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'desktop:grid desktop:grid-cols-[minmax(0,1fr)_22rem] desktop:items-start desktop:gap-6',
        className,
      )}
    >
      <div
        className={cn(
          'desktop:order-2 desktop:sticky desktop:top-6',
          // No desktop a coluna de apoio vira uma pilha com respiro próprio; no
          // celular ela não é nada, e os blocos ficam com o espaçamento deles.
          'desktop:flex desktop:flex-col desktop:gap-4',
        )}
      >
        {apoio}
      </div>
      <div className="desktop:order-1 desktop:min-w-0">{children}</div>
    </div>
  )
}
