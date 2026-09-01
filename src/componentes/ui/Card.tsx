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
          ? 'bg-superficie-escura text-escuro'
          : 'bg-superficie text-claro shadow-card',
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
        <span className="truncate text-corpo font-medium text-claro">{titulo}</span>
        {descricao && (
          <span className="truncate text-apoio text-claro-secundario">{descricao}</span>
        )}
      </span>
      {fim}
      {aoTocar && comSeta && (
        <ChevronRight aria-hidden size={20} className="shrink-0 text-claro-secundario" />
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
    <button type="button" onClick={aoTocar} className={cn(classes, 'active:bg-borda-clara/50')}>
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
        '[&>*+*]:border-t [&>*+*]:border-borda-clara',
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
        sobreEscuro ? 'bg-acento text-claro' : 'bg-acento-suave text-claro',
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
          sobreEscuro ? 'text-escuro-secundario' : 'text-claro-secundario',
        )}
      >
        {rotulo}
      </span>
      <span
        className={cn('text-destaque', sobreEscuro ? 'text-acento' : 'text-claro')}
      >
        {valor}
      </span>
    </div>
  )
}
