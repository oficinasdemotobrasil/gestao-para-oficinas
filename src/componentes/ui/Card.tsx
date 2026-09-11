import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

interface PropsCard {
  children: ReactNode
  className?: string
  /** Card escuro para conteúdo secundário, que não deve competir com o branco. */
  escuro?: boolean
}

export function Card({ children, className, escuro = false }: PropsCard) {
  return (
    <div
      className={cn(
        'rounded-card p-5',
        escuro
          ? 'bg-fundo-2 text-em-fundo'
          : 'bg-superficie text-em-superficie shadow-card',
        className,
      )}
    >
      {children}
    </div>
  )
}

interface PropsLinha {
  /** Ícone em círculo, ou a placa em destaque. */
  inicio?: ReactNode
  titulo: string
  descricao?: string
  fim?: ReactNode
  aoTocar?: () => void
  /** Esconde a seta quando a linha não leva a lugar nenhum. */
  comSeta?: boolean
}

/**
 * Uma linha de lista dentro de um card branco. A linha inteira é tocável e tem
 * pelo menos 64px de altura.
 */
export function LinhaLista({
  inicio,
  titulo,
  descricao,
  fim,
  aoTocar,
  comSeta = true,
}: PropsLinha) {
  const conteudo = (
    <>
      {inicio && <span className="shrink-0">{inicio}</span>}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-corpo font-medium text-em-superficie">{titulo}</span>
        {/* O título trunca (nome de cliente pode ser longo), mas a descrição
            quebra em até duas linhas: é onde mora o período de posse, a
            quilometragem, o preço — cortar isso esvazia a linha. */}
        {descricao && (
          <span className="line-clamp-2 text-apoio text-em-superficie-2">{descricao}</span>
        )}
      </span>
      {fim}
      {aoTocar && comSeta && (
        <ChevronRight aria-hidden size={20} className="shrink-0 text-em-superficie-2" />
      )}
    </>
  )

  const classes =
    'flex min-h-linha w-full items-center gap-3 px-5 text-left ' +
    'transition-colors duration-padrao ease-padrao'

  if (!aoTocar) {
    return <div className={classes}>{conteudo}</div>
  }

  return (
    <button type="button" onClick={aoTocar} className={cn(classes, 'active:bg-borda-em-superficie/50')}>
      {conteudo}
    </button>
  )
}

/** Agrupa linhas em um único card branco, com divisórias entre elas. */
export function ListaCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-card bg-superficie shadow-card',
        '[&>*+*]:border-t [&>*+*]:border-borda-em-superficie',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Ícone ilustrativo em círculo amarelo, como manda a direção visual. */
export function IconeCirculo({
  children,
  sobreEscuro = false,
}: {
  children: ReactNode
  sobreEscuro?: boolean
}) {
  return (
    <span
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full',
        sobreEscuro ? 'bg-acento text-em-superficie' : 'bg-acento-suave text-em-superficie',
      )}
    >
      {children}
    </span>
  )
}

/** Rótulo pequeno em cima, número grande embaixo. Nunca o contrário. */
export function Destaque({
  rotulo,
  valor,
  sobreEscuro = false,
}: {
  rotulo: string
  valor: string | number
  sobreEscuro?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className={cn(
          'text-rotulo',
          sobreEscuro ? 'text-em-fundo-2' : 'text-em-superficie-2',
        )}
      >
        {rotulo}
      </span>
      <span
        className={cn('text-destaque', sobreEscuro ? 'text-acento-forte' : 'text-em-superficie')}
      >
        {valor}
      </span>
    </div>
  )
}
