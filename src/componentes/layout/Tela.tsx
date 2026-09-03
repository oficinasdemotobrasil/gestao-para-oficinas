import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/cn'

interface PropsTela {
  children: ReactNode
  /** Reserva o espaço da tab bar. Telas internas sem barra passam false. */
  comTabBar?: boolean
  /**
   * A tela tem uma barra fixa embaixo, acima da tab bar — o total do orçamento,
   * por exemplo. Reserva o espaço dela para o conteúdo não terminar escondido.
   *
   * É uma propriedade e não um `className` de fora de propósito: dois
   * `pb-[...]` concorrentes não se resolvem pela ordem em que são escritos, e
   * sim pela ordem no CSS gerado. Já aconteceu — o fim do orçamento ficava
   * embaixo do rodapé e a tela parecia ter travado de rolar.
   */
  comRodapeFixo?: boolean
  className?: string
}

/** Altura do rodapé fixo: linha do total (34) + espaço (8) + botão (56) + padding (24). */
const ALTURA_RODAPE = 130
/** Ar entre o fim do conteúdo e o rodapé. Encostar um no outro parece defeito. */
const RESPIRO = 24

export function Tela({
  children,
  comTabBar = true,
  comRodapeFixo = false,
  className,
}: PropsTela) {
  // Os espaços em volta do "+" não são estilo: calc() sem eles é inválido e o
  // navegador descarta a regra inteira, virando zero. O Tailwind normaliza isso
  // sozinho nas classes; escrito à mão, é por nossa conta.
  const espacoDeBaixo = [
    comTabBar ? 'var(--altura-tabbar)' : '0px',
    comRodapeFixo ? `${ALTURA_RODAPE + RESPIRO}px` : '24px',
    'env(safe-area-inset-bottom)',
  ].join(' + ')

  return (
    <main
      className={cn('mx-auto min-h-dvh w-full max-w-lg px-5 pt-seguro', className)}
      style={{ paddingBottom: `calc(${espacoDeBaixo})` }}
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
