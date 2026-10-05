/**
 * O movimento da página de vendas.
 *
 * Três regras valem para tudo aqui:
 *
 *   1. Quem pediu menos movimento no aparelho (acessibilidade do sistema) não
 *      vê nada se mexer: o conteúdo aparece pronto, no lugar.
 *   2. Nada esconde conteúdo de quem não tem JavaScript rodando ou de quem
 *      rola rápido: o que aparece ao rolar começa visível se o observador não
 *      existir, e a animação dura menos de um segundo.
 *   3. Só se anima `transform` e `opacity`, que o navegador desenha sem
 *      recalcular a página — no celular velho da oficina, rolar continua liso.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/** A pessoa pediu menos movimento no sistema? */
export function useReduzMovimento(): boolean {
  const [reduz, setReduz] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const consulta = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!consulta) return
    const mudou = () => setReduz(consulta.matches)
    consulta.addEventListener('change', mudou)
    return () => consulta.removeEventListener('change', mudou)
  }, [])
  return Boolean(reduz)
}

/** Fica verdadeiro na primeira vez que o elemento aparece na tela, e não volta. */
export function useApareceu<T extends Element>(margem = '0px 0px -12% 0px') {
  const ref = useRef<T>(null)
  const [apareceu, setApareceu] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setApareceu(true)
      return
    }
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          setApareceu(true)
          observador.disconnect()
        }
      },
      { rootMargin: margem },
    )
    observador.observe(el)
    return () => observador.disconnect()
  }, [margem])
  return { ref, apareceu }
}

type Direcao = 'baixo' | 'esquerda' | 'direita'

const DESLOCAMENTO: Record<Direcao, string> = {
  baixo: 'translate3d(0, 24px, 0)',
  esquerda: 'translate3d(-32px, 0, 0)',
  direita: 'translate3d(32px, 0, 0)',
}

/**
 * Aparece suavemente ao entrar na tela. `atraso` em milissegundos faz a
 * sequência em cascata (cartões um depois do outro).
 */
export function Revelar({
  children,
  atraso = 0,
  de = 'baixo',
  className,
  como: Tag = 'div',
}: {
  children: ReactNode
  atraso?: number
  de?: Direcao
  className?: string
  como?: 'div' | 'li' | 'section'
}) {
  const reduz = useReduzMovimento()
  const { ref, apareceu } = useApareceu<HTMLDivElement>()
  const estilo: CSSProperties = reduz
    ? {}
    : {
        opacity: apareceu ? 1 : 0,
        transform: apareceu ? 'none' : DESLOCAMENTO[de],
        transition: 'opacity 700ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 700ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        transitionDelay: `${atraso}ms`,
        willChange: apareceu ? undefined : 'opacity, transform',
      }
  return (
    // O `ref` é de div; li e section aceitam o mesmo tipo de nó para observar.
    <Tag ref={ref as never} className={className} style={estilo}>
      {children}
    </Tag>
  )
}

/**
 * Um número que conta até o valor quando aparece na tela — o preço "chegando".
 * Quem pediu menos movimento vê o valor final direto. O texto final é sempre
 * o formatado, então leitor de tela e cópia pegam o número certo.
 */
export function Contador({
  valor,
  formatar,
  duracao = 900,
}: {
  valor: number
  formatar: (n: number) => string
  duracao?: number
}) {
  const reduz = useReduzMovimento()
  const { ref, apareceu } = useApareceu<HTMLSpanElement>()
  const [atual, setAtual] = useState(reduz ? valor : 0)

  useEffect(() => {
    if (reduz) {
      setAtual(valor)
      return
    }
    if (!apareceu) return
    let quadro = 0
    const inicio = performance.now()
    const passo = (agora: number) => {
      const t = Math.min((agora - inicio) / duracao, 1)
      // Desacelera no fim: chega devagar ao número certo.
      const suave = 1 - Math.pow(1 - t, 3)
      setAtual(valor * suave)
      if (t < 1) quadro = requestAnimationFrame(passo)
    }
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [apareceu, valor, duracao, reduz])

  return (
    <span ref={ref} aria-label={formatar(valor)}>
      <span aria-hidden>{formatar(atual)}</span>
    </span>
  )
}

/**
 * Cartão com uma luz que segue o mouse — o brilho da cor da marca, bem fraco,
 * no ponto em que a pessoa está olhando. No celular (sem mouse) o cartão fica
 * como sempre foi.
 */
export function CartaoComLuz({
  children,
  className,
  destaque = false,
}: {
  children: ReactNode
  className?: string
  destaque?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduz = useReduzMovimento()

  function mover(e: React.PointerEvent<HTMLDivElement>) {
    if (reduz || e.pointerType !== 'mouse' || !ref.current) return
    const caixa = ref.current.getBoundingClientRect()
    ref.current.style.setProperty('--luz-x', `${e.clientX - caixa.left}px`)
    ref.current.style.setProperty('--luz-y', `${e.clientY - caixa.top}px`)
  }

  return (
    <div
      ref={ref}
      onPointerMove={mover}
      className={[
        'group/luz relative isolate overflow-hidden',
        'motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-padrao motion-safe:hover:-translate-y-1',
        className ?? '',
      ].join(' ')}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover/luz:opacity-100"
        style={{
          background: `radial-gradient(420px circle at var(--luz-x, 50%) var(--luz-y, 0%), rgb(var(--cor-acento) / ${destaque ? 0.16 : 0.1}), transparent 60%)`,
        }}
      />
      {children}
    </div>
  )
}

/**
 * A barrinha no topo que mostra quanto da página já foi lido. Um elemento só,
 * escalado — não recalcula layout ao rolar.
 */
export function ProgressoDaLeitura() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let quadro = 0
    const atualizar = () => {
      quadro = 0
      const total = document.documentElement.scrollHeight - window.innerHeight
      const fracao = total > 0 ? Math.min(window.scrollY / total, 1) : 0
      if (ref.current) ref.current.style.transform = `scaleX(${fracao})`
    }
    const aoRolar = () => {
      if (!quadro) quadro = requestAnimationFrame(atualizar)
    }
    atualizar()
    window.addEventListener('scroll', aoRolar, { passive: true })
    window.addEventListener('resize', aoRolar)
    return () => {
      window.removeEventListener('scroll', aoRolar)
      window.removeEventListener('resize', aoRolar)
      cancelAnimationFrame(quadro)
    }
  }, [])
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-30 h-[3px]">
      <div ref={ref} className="h-full origin-left bg-acento" style={{ transform: 'scaleX(0)' }} />
    </div>
  )
}

/** O brilho que atravessa um selo, de tempos em tempos. */
export function Brilho() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <span className="absolute inset-y-0 left-0 w-1/3 bg-white/50 motion-safe:animate-brilho motion-reduce:hidden" />
    </span>
  )
}
