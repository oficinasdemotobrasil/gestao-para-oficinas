import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/** Campos vivem dentro do card branco: fundo claro, texto escuro. */
const controle =
  'w-full rounded-controle border bg-white px-4 text-corpo text-claro ' +
  'placeholder:text-claro-secundario transition-colors duration-padrao ease-padrao ' +
  'disabled:opacity-60'

const semErro = 'border-borda-clara focus:border-acento'
const comErro = 'border-erro'

interface Envolucro {
  rotulo: string
  erro?: string
  dica?: string
  obrigatorio?: boolean
  id: string
  children: React.ReactNode
}

function Envolver({ rotulo, erro, dica, obrigatorio, id, children }: Envolucro) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-rotulo text-claro-secundario">
        {rotulo}
        {obrigatorio && <span className="text-erro"> *</span>}
      </label>
      {children}
      {/* A mensagem de erro diz o que fazer, nunca só "inválido". */}
      {erro ? (
        <p id={`${id}-erro`} role="alert" className="text-apoio text-erro">
          {erro}
        </p>
      ) : dica ? (
        <p className="text-apoio text-claro-secundario">{dica}</p>
      ) : null}
    </div>
  )
}

interface PropsCampo extends InputHTMLAttributes<HTMLInputElement> {
  rotulo: string
  erro?: string
  dica?: string
  obrigatorio?: boolean
}

export const Campo = forwardRef<HTMLInputElement, PropsCampo>(function Campo(
  { rotulo, erro, dica, obrigatorio, className, id, ...resto },
  ref,
) {
  const gerado = useId()
  const idCampo = id ?? gerado
  return (
    <Envolver rotulo={rotulo} erro={erro} dica={dica} obrigatorio={obrigatorio} id={idCampo}>
      <input
        ref={ref}
        id={idCampo}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${idCampo}-erro` : undefined}
        className={cn(controle, 'h-campo', erro ? comErro : semErro, className)}
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
        <span className="text-corpo text-claro">{rotulo}</span>
        {descricao && <span className="text-apoio text-claro-secundario">{descricao}</span>}
      </span>
      <span
        aria-hidden
        className={cn(
          'relative h-8 w-14 shrink-0 rounded-full transition-colors duration-padrao ease-padrao',
          marcado ? 'bg-acento' : 'bg-borda-clara',
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
