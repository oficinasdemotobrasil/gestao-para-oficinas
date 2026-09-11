import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/** Campos vivem dentro do card branco: fundo claro, texto escuro. */
const controle =
  'w-full rounded-controle border bg-white px-4 text-corpo text-em-superficie ' +
  'placeholder:text-em-superficie-2 transition-colors duration-padrao ease-padrao ' +
  'disabled:opacity-60'

const semErro = 'border-borda-em-superficie focus:border-acento'
const comErro = 'border-erro'

interface Envolucro {
  rotulo: string
  erro?: string
  dica?: string
  obrigatorio?: boolean
  /**
   * O campo está solto sobre o fundo da tela, e não dentro de um cartão.
   *
   * É o caso dos filtros de data do financeiro e da lista de ordens. Importa
   * porque o cinza que se lê sobre o branco do cartão (5,3:1) não se lê sobre
   * o preto do fundo (3,7:1) — e não existe um cinza que sirva nos dois.
   */
  sobreFundo?: boolean
  id: string
  children: React.ReactNode
}

function Envolver({ rotulo, erro, dica, obrigatorio, sobreFundo, id, children }: Envolucro) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className={`text-rotulo ${sobreFundo ? 'text-em-fundo-2' : 'text-em-superficie-2'}`}
      >
        {rotulo}
        {obrigatorio && <span className="text-erro-forte"> *</span>}
      </label>
      {children}
      {/* A mensagem de erro diz o que fazer, nunca só "inválido". */}
      {erro ? (
        <p id={`${id}-erro`} role="alert" className="text-apoio text-erro-forte">
          {erro}
        </p>
      ) : dica ? (
        <p className="text-apoio text-em-superficie-2">{dica}</p>
      ) : null}
    </div>
  )
}

interface PropsCampo extends InputHTMLAttributes<HTMLInputElement> {
  rotulo: string
  erro?: string
  dica?: string
  obrigatorio?: boolean
  /** Ver Envolucro: o campo está solto sobre o fundo, fora de um cartão. */
  sobreFundo?: boolean
}

export const Campo = forwardRef<HTMLInputElement, PropsCampo>(function Campo(
  { rotulo, erro, dica, obrigatorio, sobreFundo, className, id, ...resto },
  ref,
) {
  const gerado = useId()
  const idCampo = id ?? gerado
  return (
    <Envolver
      rotulo={rotulo}
      erro={erro}
      dica={dica}
      obrigatorio={obrigatorio}
      sobreFundo={sobreFundo}
      id={idCampo}
    >
      <input
        ref={ref}
        id={idCampo}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${idCampo}-erro` : undefined}
        className={cn(controle, 'h-campo', erro ? comErro : semErro, className)}
        // O navegador lembra o que já foi digitado em cada campo pelo nome/id, e
        // sugere de volta em outro cadastro — foi o que empilhou o e-mail do
        // login dentro de "Observações". Desligado por padrão; a tela de login
        // religa explicitamente para o gerenciador de senha funcionar.
        autoComplete="off"
        {...resto}
      />
    </Envolver>
  )
})

interface PropsSelecao extends SelectHTMLAttributes<HTMLSelectElement> {
  rotulo: string
  erro?: string
  dica?: string
  obrigatorio?: boolean
}

export const Selecao = forwardRef<HTMLSelectElement, PropsSelecao>(function Selecao(
  { rotulo, erro, dica, obrigatorio, className, id, children, ...resto },
  ref,
) {
  const gerado = useId()
  const idCampo = id ?? gerado
  return (
    <Envolver rotulo={rotulo} erro={erro} dica={dica} obrigatorio={obrigatorio} id={idCampo}>
      <select
        ref={ref}
        id={idCampo}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${idCampo}-erro` : undefined}
        className={cn(controle, 'h-campo appearance-none', erro ? comErro : semErro, className)}
        autoComplete="off"
        {...resto}
      >
        {children}
      </select>
    </Envolver>
  )
})

interface PropsTexto extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  rotulo: string
  erro?: string
  dica?: string
  obrigatorio?: boolean
}

export const AreaTexto = forwardRef<HTMLTextAreaElement, PropsTexto>(function AreaTexto(
  { rotulo, erro, dica, obrigatorio, className, id, rows = 3, ...resto },
  ref,
) {
  const gerado = useId()
  const idCampo = id ?? gerado
  return (
    <Envolver rotulo={rotulo} erro={erro} dica={dica} obrigatorio={obrigatorio} id={idCampo}>
      <textarea
        ref={ref}
        id={idCampo}
        rows={rows}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${idCampo}-erro` : undefined}
        className={cn(controle, 'py-3', erro ? comErro : semErro, className)}
        autoComplete="off"
        {...resto}
      />
    </Envolver>
  )
})

interface PropsInterruptor {
  rotulo: string
  descricao?: string
  marcado: boolean
  aoMudar: (valor: boolean) => void
  desabilitado?: boolean
}

/** Usado em "Ativo / Inativo" de colaborador, produto e serviço. */
export function Interruptor({
  rotulo,
  descricao,
  marcado,
  aoMudar,
  desabilitado,
}: PropsInterruptor) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={marcado}
      disabled={desabilitado}
      onClick={() => aoMudar(!marcado)}
      className="flex min-h-toque w-full items-center justify-between gap-4 text-left disabled:opacity-60"
    >
      <span className="flex flex-col">
        <span className="text-corpo text-em-superficie">{rotulo}</span>
        {descricao && <span className="text-apoio text-em-superficie-2">{descricao}</span>}
      </span>
      <span
        aria-hidden
        className={cn(
          'relative h-8 w-14 shrink-0 rounded-full transition-colors duration-padrao ease-padrao',
          marcado ? 'bg-acento' : 'bg-borda-em-superficie',
        )}
      >
        <span
          className={cn(
            'absolute top-1 h-6 w-6 rounded-full bg-white shadow-card transition-all duration-padrao ease-padrao',
            marcado ? 'left-7' : 'left-1',
          )}
        />
      </span>
    </button>
  )
}
