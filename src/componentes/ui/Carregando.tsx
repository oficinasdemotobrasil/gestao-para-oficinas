import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

export function Carregando({ rotulo = 'Carregando…' }: { rotulo?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-3 px-6 py-12 text-center"
    >
      <Loader2 aria-hidden size={28} className="animate-spin text-acento" />
      <span className="text-corpo text-escuro-secundario">{rotulo}</span>
    </div>
  )
}

/**
 * Blocos cinzas no lugar do conteúdo enquanto ele chega. Melhor que um giro no
 * meio da tela: a pessoa já vê o formato do que está por vir.
 */
export function Esqueleto({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-controle bg-superficie-escura', className)}
    />
  )
}

export function EsqueletoLista({ linhas = 4 }: { linhas?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: linhas }).map((_, i) => (
        <Esqueleto key={i} className="h-linha w-full rounded-card" />
      ))}
    </div>
  )
}
