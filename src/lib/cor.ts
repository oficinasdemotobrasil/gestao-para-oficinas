/**
 * A matemática da cor da marca.
 *
 * A oficina escolhe uma cor e ela substitui o amarelo nos destaques. Só que o
 * acento aparece de duas formas opostas no app, e uma cor pode servir para uma
 * e arruinar a outra:
 *
 *   1. como FUNDO de botão, com texto escuro por cima  (bg-acento text-claro)
 *   2. como TEXTO, sobre o fundo escuro do app          (text-acento)
 *
 * Um azul-marinho passa como fundo de botão e some como texto. Por isso toda
 * cor é medida contra os dois, e só entra se passar nos dois.
 *
 * A conta de contraste é a da WCAG 2.1, que é a mesma que os leitores de tela
 * e as ferramentas de acessibilidade usam. Mínimo de 4.5:1 para texto.
 */

/** Texto escuro que fica POR CIMA do acento quando ele é fundo de botão. */
const TEXTO_SOBRE_O_ACENTO = '#111113'

/**
 * Fundo mais claro do app, onde o acento vira texto. É o pior caso: qualquer
 * cor que se leia aqui também se lê sobre o preto do fundo.
 */
const FUNDO_MAIS_CLARO_DO_APP = '#1a1a1c'

export const CONTRASTE_MINIMO = 4.5

export type Rgb = { r: number; g: number; b: number }
export type Hsl = { h: number; s: number; l: number }

const limitar = (n: number, minimo: number, maximo: number) =>
  Math.min(maximo, Math.max(minimo, n))

export function ehHexadecimal(cor: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(cor.trim())
}

export function paraRgb(hex: string): Rgb {
  const limpo = hex.trim().replace('#', '')
  return {
    r: parseInt(limpo.slice(0, 2), 16),
    g: parseInt(limpo.slice(2, 4), 16),
    b: parseInt(limpo.slice(4, 6), 16),
  }
}

export function paraHex({ r, g, b }: Rgb): string {
  const doisDigitos = (n: number) =>
    Math.round(limitar(n, 0, 255)).toString(16).padStart(2, '0')
  return `#${doisDigitos(r)}${doisDigitos(g)}${doisDigitos(b)}`
}

export function paraHsl(hex: string): Hsl {
  const { r, g, b } = paraRgb(hex)
  const vr = r / 255
  const vg = g / 255
  const vb = b / 255
  const maior = Math.max(vr, vg, vb)
  const menor = Math.min(vr, vg, vb)
  const l = (maior + menor) / 2
  if (maior === menor) return { h: 0, s: 0, l }

  const d = maior - menor
  const s = l > 0.5 ? d / (2 - maior - menor) : d / (maior + menor)
  let h: number
  if (maior === vr) h = ((vg - vb) / d + (vg < vb ? 6 : 0)) / 6
  else if (maior === vg) h = ((vb - vr) / d + 2) / 6
  else h = ((vr - vg) / d + 4) / 6
  return { h, s, l }
}

export function deHsl({ h, s, l }: Hsl): string {
  if (s === 0) {
    const cinza = l * 255
    return paraHex({ r: cinza, g: cinza, b: cinza })
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const canal = (t: number) => {
    let v = t
    if (v < 0) v += 1
    if (v > 1) v -= 1
    if (v < 1 / 6) return p + (q - p) * 6 * v
    if (v < 1 / 2) return q
    if (v < 2 / 3) return p + (q - p) * (2 / 3 - v) * 6
    return p
  }
  return paraHex({
    r: canal(h + 1 / 3) * 255,
    g: canal(h) * 255,
    b: canal(h - 1 / 3) * 255,
  })
}

/** Luminância relativa da WCAG: quanta luz a cor devolve, de 0 a 1. */
export function luminancia(hex: string): number {
  const { r, g, b } = paraRgb(hex)
  const canal = (valor: number) => {
    const v = valor / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

/** Razão de contraste entre duas cores, de 1:1 (iguais) a 21:1 (preto/branco). */
export function contraste(umaCor: string, outraCor: string): number {
  const a = luminancia(umaCor)
  const b = luminancia(outraCor)
  const clara = Math.max(a, b)
  const escura = Math.min(a, b)
  return (clara + 0.05) / (escura + 0.05)
}

export type Avaliacao = {
  aprovada: boolean
  comoFundoDeBotao: number
  comoTexto: number
}

/** Mede a cor nas duas situações em que o app a usa. */
export function avaliarCor(hex: string): Avaliacao {
  const comoFundoDeBotao = contraste(hex, TEXTO_SOBRE_O_ACENTO)
  const comoTexto = contraste(hex, FUNDO_MAIS_CLARO_DO_APP)
  return {
    comoFundoDeBotao,
    comoTexto,
    aprovada:
      comoFundoDeBotao >= CONTRASTE_MINIMO && comoTexto >= CONTRASTE_MINIMO,
  }
}

/**
 * A cor mais próxima que passa, mantendo o tom escolhido.
 *
 * Clarear ajuda nas duas medidas ao mesmo tempo — mais claro se lê melhor
 * sobre o fundo escuro e continua se lendo sob o texto preto do botão. Então
 * subimos a luminosidade de 1% em 1%, sem mexer no tom nem na saturação: a
 * pessoa escolheu vermelho, recebe um vermelho, não um laranja.
 *
 * Devolve null se nem o branco resolver, o que não acontece na prática.
 */
export function corMaisProximaQuePassa(hex: string): string | null {
  if (avaliarCor(hex).aprovada) return hex
  const { h, s, l } = paraHsl(hex)
  for (let passo = 1; passo <= 100; passo++) {
    const tentativa = deHsl({ h, s, l: limitar(l + passo / 100, 0, 1) })
    if (avaliarCor(tentativa).aprovada) return tentativa
  }
  return null
}

/**
 * O acento não é uma cor, são três: a cor, a versão pressionada e o fundo
 * suave usado em etiquetas. Deriva as outras duas para a oficina escolher uma
 * só e não ter que entender o resto.
 */
export function tonsDoAcento(hex: string): {
  acento: string
  pressionado: string
  suave: string
} {
  const { h, s, l } = paraHsl(hex)
  return {
    acento: hex.toLowerCase(),
    // Um pouco mais escura, para o toque ter resposta visível.
    pressionado: deHsl({ h, s, l: limitar(l - 0.08, 0, 1) }),
    // Fundo de etiqueta: quase branco com o tom por baixo, para o texto
    // escuro do projeto continuar legível em cima sem nenhum ajuste.
    suave: deHsl({ h, s: limitar(s * 0.55, 0, 1), l: 0.9 }),
  }
}

/**
 * As oito cores prontas. Todas medidas nas duas situações antes de entrar
 * aqui — o teste scripts/teste-cor.ts falha se alguma parar de passar.
 */
export const PALETA: { nome: string; hex: string }[] = [
  { nome: 'Amarelo', hex: '#f5c518' },
  { nome: 'Âmbar', hex: '#f59e0b' },
  { nome: 'Laranja', hex: '#fb923c' },
  { nome: 'Vermelho', hex: '#f87171' },
  { nome: 'Rosa', hex: '#f472b6' },
  { nome: 'Roxo', hex: '#c084fc' },
  { nome: 'Azul', hex: '#60a5fa' },
  { nome: 'Verde', hex: '#4ade80' },
]

/** A cor do produto, usada quando a oficina não escolheu nenhuma. */
export const COR_DO_PRODUTO = '#f5c518'
