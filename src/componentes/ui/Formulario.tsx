import type { FormEventHandler, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * O cartão branco onde mora um formulário.
 *
 * No celular, uma coluna — como sempre foi. Do tablet em diante, duas: no
 * balcão a tela é larga e o formulário de uma coluna vira uma fita fina no meio
 * de um monitor, com o olho subindo e descendo à toa.
 *
 * A troca de `flex flex-col gap-4` por `grid grid-cols-1 gap-4` não muda um
 * pixel no celular — uma coluna com o mesmo respiro —, e é ela que abre a
 * segunda coluna depois.
 */
export function Formulario({
  children,
  aoEnviar,
  acoes,
  className,
}: {
  children: ReactNode
  aoEnviar?: FormEventHandler<HTMLFormElement>
  /** Botões do rodapé. Largura total no celular, à direita no desktop. */
  acoes?: ReactNode
  className?: string
}) {
  return (
    <form
      onSubmit={aoEnviar}
      noValidate
      className={cn(
        'grid grid-cols-1 gap-4 rounded-card bg-superficie p-5 shadow-card',
        'tablet:grid-cols-2 tablet:gap-x-5 tablet:p-6',
        className,
      )}
    >
      {children}
      {acoes && (
        <div className="pt-2 tablet:col-span-2 tablet:flex tablet:justify-end tablet:gap-3">
          {acoes}
        </div>
      )}
    </form>
  )
}

/**
 * Campo que ocupa a largura inteira do formulário.
 *
 * Serve para o que precisa de espaço para respirar — observação, endereço,
 * descrição — e para o que não tem par natural, como uma mensagem de erro. Um
 * campo de texto longo espremido em meia largura convida a escrever menos.
 */
export function LinhaInteira({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('tablet:col-span-2', className)}>{children}</div>
}
