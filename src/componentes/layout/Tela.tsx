import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/cn'

interface PropsTela {
  children: ReactNode
  /** Reserva o espaço da tab bar. Telas internas sem barra passam false. */
  comTabBar?: boolean
  className?: string
}

export function Tela({ children, comTabBar = true, className }: PropsTela) {
  return (
    <main
      className={cn(
        'mx-auto min-h-dvh w-full max-w-lg px-5 pt-seguro',
        comTabBar
          ? 'pb-[calc(var(--altura-tabbar)+24px+env(safe-area-inset-bottom))]'
          : 'pb-[calc(24px+env(safe-area-inset-bottom))]',
        className,
      )}
    >
      {children}
    </main>
  )
}

/** Cabeçalho de tela: saudação pessoal e uma linha de contexto embaixo. */
export function CabecalhoTela({
  titulo,
  contexto,
  acao,
}: {
  titulo: string
  contexto?: string
  acao?: ReactNode
}) {
  return (
    <header className="flex items-start justify-between gap-4 pb-6 pt-6">
      <div className="min-w-0">
        <h1 className="text-titulo text-escuro">{titulo}</h1>
        {contexto && <p className="pt-1 text-apoio text-escuro-secundario">{contexto}</p>}
      </div>
      {acao}
    </header>
  )
}

/** Cabeçalho de tela interna, com voltar. */
export function CabecalhoInterno({
  titulo,
  contexto,
  acao,
  aoVoltar,
}: {
  titulo: string
  contexto?: string
  acao?: ReactNode
  aoVoltar?: () => void
}) {
  const navegar = useNavigate()
  return (
    <header className="pb-6 pt-4">
      <button
        type="button"
        onClick={() => (aoVoltar ? aoVoltar() : navegar(-1))}
        className="-ml-2 flex min-h-toque items-center gap-1 pr-3 text-corpo text-acento"
      >
        <ChevronLeft aria-hidden size={22} />
        Voltar
      </button>
      <div className="flex items-start justify-between gap-4 pt-2">
        <div className="min-w-0">
          <h1 className="text-titulo text-escuro">{titulo}</h1>
          {contexto && <p className="pt-1 text-apoio text-escuro-secundario">{contexto}</p>}
        </div>
        {acao}
      </div>
    </header>
  )
}

/** Título de um bloco dentro da tela. */
export function TituloSecao({ children, acao }: { children: ReactNode; acao?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 pb-3 pt-6">
      <h2 className="text-secao text-escuro">{children}</h2>
      {acao}
    </div>
  )
}
