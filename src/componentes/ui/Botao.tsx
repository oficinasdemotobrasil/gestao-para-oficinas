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
  /**
   * Largura total no celular, mas do tamanho do texto do tablet em diante.
   *
   * Um botão "Salvar" de 1200px de largura num monitor parece um erro. No
   * celular ele continua largo, porque lá o alvo grande é o que importa.
   */
  compactoNoDesktop?: boolean
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
  principal: 'h-botao bg-acento text-em-superficie active:bg-acento-pressionado',
  // Sobre o card branco, quando a ação não é a principal da tela.
  // Preto com texto branco, sobre o cartão branco — nos dois temas. Usa token
  // próprio: antes pegava a cor de TEXTO emprestada como fundo, e no tema
  // claro isso viraria escuro sobre escuro.
  secundario: 'h-botao bg-inverso text-em-inverso active:opacity-80',
  // Contorno sobre o fundo preto da tela.
  contorno:
    'h-botao border border-borda-em-fundo bg-transparent text-em-fundo active:bg-fundo-2',
  // Contorno dentro de um card branco. Existe como variante própria porque
  // corrigir a cor por className não funciona: entre text-em-fundo e text-em-superficie
  // quem vence é a ordem no CSS gerado pelo Tailwind, não a ordem em que as
  // classes aparecem no atributo. O resultado era texto branco em card branco.
  'contorno-no-card':
    'h-botao border border-borda-em-superficie bg-transparent text-em-superficie active:bg-borda-em-superficie/40',
  texto: 'min-h-toque text-acento-forte active:opacity-70 px-2',
  perigo: 'min-h-toque text-erro-forte active:opacity-70 px-2',
}

export function Botao({
  variante = 'principal',
  largo = false,
  compactoNoDesktop = false,
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
      className={cn(
        base,
        variantes[variante],
        largo && 'w-full',
        // Prefixo de tamanho tem ordem previsível no CSS gerado: a variante de
        // tablet vem depois da base, então ela vence acima de 768px sem depender
        // da ordem em que as classes foram escritas.
        compactoNoDesktop && 'tablet:w-auto tablet:px-8',
        className,
      )}
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
