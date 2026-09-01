import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

type Variante =
  | 'principal'
  | 'secundario'
  | 'contorno'
  | 'contorno-no-card'
  | 'texto'
  | 'perigo'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  /** Ocupa a largura toda. Padrão do app: o botão de ação principal é largo. */
  largo?: boolean
  carregando?: boolean
  icone?: ReactNode
}

// Altura sempre igual ou maior que o alvo mínimo de toque: o app é usado com a
// mão suja, muitas vezes com luva.
const base =
  'inline-flex items-center justify-center gap-2 rounded-controle px-5 ' +
  'text-corpo font-semibold transition-colors duration-padrao ease-padrao ' +
  'disabled:opacity-50 disabled:pointer-events-none select-none'

const variantes: Record<Variante, string> = {
  principal: 'h-botao bg-acento text-claro active:bg-acento-pressionado',
  // Sobre o card branco, quando a ação não é a principal da tela.
  secundario: 'h-botao bg-claro text-escuro active:opacity-80',
  // Contorno sobre o fundo preto da tela.
  contorno:
    'h-botao border border-borda-escura bg-transparent text-escuro active:bg-superficie-escura',
  // Contorno dentro de um card branco. Existe como variante própria porque
  // corrigir a cor por className não funciona: entre text-escuro e text-claro
  // quem vence é a ordem no CSS gerado pelo Tailwind, não a ordem em que as
  // classes aparecem no atributo. O resultado era texto branco em card branco.
  'contorno-no-card':
    'h-botao border border-borda-clara bg-transparent text-claro active:bg-borda-clara/40',
  texto: 'min-h-toque text-acento active:opacity-70 px-2',
  perigo: 'min-h-toque text-erro active:opacity-70 px-2',
}

export function Botao({
  variante = 'principal',
  largo = false,
  carregando = false,
  icone,
  children,
  className,
  disabled,
  type = 'button',
  ...resto
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={cn(base, variantes[variante], largo && 'w-full', className)}
      {...resto}
    >
      {carregando ? (
        <Loader2 aria-hidden size={20} className="animate-spin" />
      ) : (
        icone
      )}
      {children}
    </button>
  )
}
