import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Props {
  aberto: boolean
  aoFechar: () => void
  titulo: string
  children: ReactNode
  /** Ações no rodapé, geralmente o botão principal do formulário. */
  rodape?: ReactNode
}

/**
 * No celular, folha que sobe pela base — a mão que segura o telefone alcança a
 * base, não o topo. Do tablet em diante, janela centralizada de 600px.
 *
 * A gaveta colada embaixo faz sentido no polegar e nenhum no mouse: num monitor
 * de 27 polegadas ela vira uma faixa no rodapé, longe de onde o olho está. E
 * uma janela centralizada no celular esconde metade do conteúdo atrás do
 * teclado virtual, que é o motivo de a gaveta existir.
 */
export function Modal({ aberto, aoFechar, titulo, children, rodape }: Props) {
  const painel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        aoFechar()
        return
      }

      // Prende o Tab dentro da janela.
      //
      // Sem isto, a terceira batida no Tab sai da janela e vai para a tela de
      // trás, que continua ali e continua clicável para o teclado. A pessoa
      // digita achando que está preenchendo a janela e está mexendo em outra
      // coisa. No celular ninguém usa Tab; no balcão, é como se preenche.
      if (e.key !== 'Tab' || !painel.current) return

      const focaveis = painel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focaveis.length === 0) return

      const primeiro = focaveis[0]
      const ultimo = focaveis[focaveis.length - 1]
      const atual = document.activeElement

      if (!e.shiftKey && atual === ultimo) {
        e.preventDefault()
        primeiro.focus()
      } else if (e.shiftKey && (atual === primeiro || atual === painel.current)) {
        e.preventDefault()
        ultimo.focus()
      }
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
    <div className="fixed inset-0 z-50 flex items-end justify-center tablet:items-center tablet:p-6">
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
        className={cn(
          'relative flex w-full flex-col bg-superficie outline-none',
          // Celular: colada embaixo, cantos arredondados só em cima.
          'max-h-[90dvh] max-w-lg rounded-t-folha',
          // Tablet e maior: solta no meio, arredondada dos quatro lados.
          'tablet:max-h-[85dvh] tablet:max-w-janela tablet:rounded-folha tablet:shadow-flutuante',
        )}
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
