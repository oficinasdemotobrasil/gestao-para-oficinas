import { useEffect, useRef } from 'react'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Props {
  valor: string
  aoMudar: (valor: string) => void
  rotulo: string
  /** Sufixo que aparece dentro do campo: "un", "L", "kg". */
  unidade?: string
  /** Ajuste aceita número negativo; entrada e saída não. */
  permiteNegativo?: boolean
  erro?: string
  dica?: string
}

/**
 * Quantidade com menos e mais.
 *
 * Existe porque digitar número em teclado de celular, com a mão suja e a moto
 * na frente, é a parte mais lenta de lançar estoque. Na maioria das vezes a
 * quantidade é 1, 2 ou 3 — dois toques resolvem, sem abrir teclado.
 *
 * O campo continua editável para quando a quantidade é 40.
 */
export function Contador({
  valor,
  aoMudar,
  rotulo,
  unidade,
  permiteNegativo = false,
  erro,
  dica,
}: Props) {
  const numero = Number(valor.replace(',', '.'))
  const atual = Number.isFinite(numero) ? numero : 0

  // Guarda o último valor fora do ciclo de render.
  //
  // Sem isto, toques rápidos se perdem: cada clique lê o valor do render
  // anterior, então apertar "+" cinco vezes seguidas soma 1 em vez de 5. É
  // exatamente o que uma pessoa faz para chegar a 5 sem abrir o teclado.
  const ultimo = useRef(valor)
  useEffect(() => {
    ultimo.current = valor
  }, [valor])

  function somar(delta: number) {
    const base = Number(ultimo.current.replace(',', '.'))
    const novo = (Number.isFinite(base) ? base : 0) + delta
    if (!permiteNegativo && novo < 0) return
    ultimo.current = String(novo).replace('.', ',')
    aoMudar(ultimo.current)
  }

  const botao =
    'flex h-campo w-14 shrink-0 items-center justify-center rounded-controle ' +
    'border border-borda-clara text-claro transition-colors duration-padrao ' +
    'ease-padrao active:bg-borda-clara/50 disabled:opacity-40'

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-rotulo text-claro-secundario">{rotulo}</span>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => somar(-1)}
          disabled={!permiteNegativo && atual <= 0}
          aria-label="Diminuir um"
          className={botao}
        >
          <Minus aria-hidden size={20} />
        </button>

        <div className="relative flex-1">
          <input
            value={valor}
            onChange={(e) => aoMudar(e.target.value)}
            inputMode="decimal"
            aria-label={rotulo}
            aria-invalid={erro ? true : undefined}
            className={cn(
              'h-campo w-full rounded-controle border bg-white px-4 text-center',
              'text-secao text-claro focus:border-acento',
              unidade && 'pr-12',
              erro ? 'border-erro' : 'border-borda-clara',
            )}
          />
          {unidade && (
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-rotulo text-claro-secundario">
              {unidade}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => somar(1)}
          aria-label="Aumentar um"
          className={botao}
        >
          <Plus aria-hidden size={20} />
        </button>
      </div>

      {erro ? (
        <p role="alert" className="text-apoio text-erro">
          {erro}
        </p>
      ) : dica ? (
        <p className="text-apoio text-claro-secundario">{dica}</p>
      ) : null}
    </div>
  )
}
