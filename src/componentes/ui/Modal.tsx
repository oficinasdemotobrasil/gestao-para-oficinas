import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  aberto: boolean
  aoFechar: () => void
  titulo: string
  children: ReactNode
  /** Ações no rodapé, geralmente o botão principal do formulário. */
  rodape?: ReactNode
}

/**
 * Folha que sobe pela base da tela, como no iPhone. Fica presa embaixo porque a
 * mão que segura o celular alcança a base, não o topo.
 */
export function Modal({ aberto, aoFechar, titulo, children, rodape }: Props) {
  const painel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', aoTeclar)

    // Trava a rolagem do fundo enquanto a folha está aberta.
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // O foco entra na folha para quem navega por teclado ou leitor de tela.
    painel.current?.focus()

    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflowAnterior
    }
  }, [aberto, aoFechar])

  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        aria-hidden
        onClick={aoFechar}
        className="absolute inset-0 bg-black/60"
      />
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className="relative flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-folha bg-superficie outline-none"
      >
        <div className="flex items-center justify-between gap-4 px-5 pb-3 pt-5">
          <h2 className="text-secao text-claro">{titulo}</h2>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="flex h-toque w-toque -mr-3 items-center justify-center text-claro-secundario"
          >
            <X aria-hidden size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-2">{children}</div>

        {rodape && (
          <div className="border-t border-borda-clara px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-4">
            {rodape}
          </div>
        )}
      </div>
    </div>
  )
}
