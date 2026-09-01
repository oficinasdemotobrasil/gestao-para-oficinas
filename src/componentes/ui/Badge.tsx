import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Tom = 'sucesso' | 'atencao' | 'erro' | 'neutro'

const tons: Record<Tom, string> = {
  sucesso: 'bg-sucesso-fundo text-sucesso',
  atencao: 'bg-atencao-fundo text-atencao',
  erro: 'bg-erro-fundo text-erro',
  neutro: 'bg-borda-clara text-claro-secundario',
}

/**
 * Badge de status à direita da linha. Sempre com a palavra escrita: cor sozinha
 * não é informação para quem não distingue as duas.
 */
export function Badge({
  children,
  tom = 'neutro',
  className,
}: {
  children: ReactNode
  tom?: Tom
  className?: string
}) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-badge px-2.5 py-1 text-apoio font-medium',
        tons[tom],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Ativo / Inativo, usado em colaborador, produto e serviço. */
export function BadgeAtivo({ ativo }: { ativo: boolean }) {
  return <Badge tom={ativo ? 'sucesso' : 'neutro'}>{ativo ? 'Ativo' : 'Inativo'}</Badge>
}
