/**
 * Gera os ícones do PWA sem depender de editor de imagem.
 *
 * Desenho: o símbolo do GIRO — anel aberto com a seta — preto sobre o amarelo
 * da marca, como manda o handoff da identidade. A geometria é a mesma do SVG,
 * recalculada em pixels porque aqui não há navegador para desenhar o traço.
 *
 *   npx tsx scripts/gerar-icones.ts
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const destino = path.join(raiz, 'public/icons')

const FUNDO: [number, number, number] = [0x0b, 0x0b, 0x0c]
const ACENTO: [number, number, number] = [0xf5, 0xc5, 0x18]

// --- Codificador de PNG -----------------------------------------------------

const tabelaCrc = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = tabelaCrc[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pedaco(tipo: string, dados: Buffer): Buffer {
  const comprimento = Buffer.alloc(4)
  comprimento.writeUInt32BE(dados.length)
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(corpo))
  return Buffer.concat([comprimento, corpo, crc])
}

function png(largura: number, altura: number, rgb: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(largura, 0)
  ihdr.writeUInt32BE(altura, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 2 // truecolor RGB
  const linhas = Buffer.alloc((largura * 3 + 1) * altura)
  for (let y = 0; y < altura; y++) {
    const inicio = y * (largura * 3 + 1)
    linhas[inicio] = 0 // sem filtro
    Buffer.from(rgb.buffer, y * largura * 3, largura * 3).copy(linhas, inicio + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco('IHDR', ihdr),
    pedaco('IDAT', deflateSync(linhas, { level: 9 })),
    pedaco('IEND', Buffer.alloc(0)),
  ])
}

// --- Desenho ----------------------------------------------------------------
//
// O símbolo da marca, nas mesmas coordenadas do SVG do handoff (viewBox 100):
// um anel aberto de raio 32 e traço 15, e a seta que fecha o giro.
//
//   <path d="M31.2 25.4 A32 32 0 1 0 72 23.6" stroke-width="15"/>
//   <path d="M66 4 L92 20 L64 36 Z"/>
//
// Aqui o anel é a coroa entre os raios 24,5 e 39,5, sem a fatia que vai de um
// ponto ao outro — é essa abertura que faz o anel virar um giro, e não um "O".

const RAIO_INTERNO = 32 - 15 / 2
const RAIO_EXTERNO = 32 + 15 / 2

/** Ângulo em graus, medido como na tela: x para a direita, y para baixo. */
function anguloEm(x: number, y: number): number {
  const g = (Math.atan2(y - 50, x - 50) * 180) / Math.PI
  return g < 0 ? g + 360 : g
}

const ABERTURA_DE = anguloEm(31.2, 25.4) // 232,6° — a ponta de cima à esquerda
const ABERTURA_ATE = anguloEm(72, 23.6) //  309,8° — onde a seta encosta

const SETA: Array<[number, number]> = [
  [66, 4],
  [92, 20],
  [64, 36],
]

function dentroDoTriangulo(x: number, y: number, t: Array<[number, number]>): boolean {
  const lado = (a: [number, number], b: [number, number]) =>
    (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])
  const d1 = lado(t[0], t[1])
  const d2 = lado(t[1], t[2])
  const d3 = lado(t[2], t[0])
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}

/** (x, y) em coordenadas do símbolo (0–100) está pintado? */
function dentroDoSimbolo(x: number, y: number): boolean {
  const dx = x - 50
  const dy = y - 50
  const distancia = Math.sqrt(dx * dx + dy * dy)
  if (distancia >= RAIO_INTERNO && distancia <= RAIO_EXTERNO) {
    const a = anguloEm(x, y)
    if (a < ABERTURA_DE || a > ABERTURA_ATE) return true
  }
  return dentroDoTriangulo(x, y, SETA)
}

/**
 * Fundo amarelo, símbolo preto — a versão do handoff para ícone de app.
 * `proporcao` é quanto do lado o símbolo ocupa (0,62 no ícone comum; menos no
 * maskable, que o sistema recorta).
 */
function desenhar(tamanho: number, proporcao: number): Uint8Array {
  const px = new Uint8Array(tamanho * tamanho * 3)
  const lado = tamanho * proporcao
  const margem = (tamanho - lado) / 2
  const amostras = 4 // suavização por supersampling

  for (let y = 0; y < tamanho; y++) {
    for (let x = 0; x < tamanho; x++) {
      let cobertura = 0
      for (let sy = 0; sy < amostras; sy++) {
        for (let sx = 0; sx < amostras; sx++) {
          const u = ((x + (sx + 0.5) / amostras - margem) / lado) * 100
          const v = ((y + (sy + 0.5) / amostras - margem) / lado) * 100
          if (u >= 0 && u <= 100 && v >= 0 && v <= 100 && dentroDoSimbolo(u, v)) cobertura++
        }
      }
      const a = cobertura / (amostras * amostras)
      const i = (y * tamanho + x) * 3
      for (let c = 0; c < 3; c++) {
        px[i + c] = Math.round(ACENTO[c] * (1 - a) + FUNDO[c] * a)
      }
    }
  }
  return px
}

// --- Saída ------------------------------------------------------------------

mkdirSync(destino, { recursive: true })

const arquivos: Array<[string, number, number]> = [
  // nome, tamanho, quanto do quadro o símbolo ocupa
  ['icon-192.png', 192, 0.62],
  ['icon-512.png', 512, 0.62],
  // Maskable: o sistema recorta as bordas, então a forma fica menor, dentro da
  // zona segura de 80%.
  ['icon-maskable-512.png', 512, 0.46],
  // O iOS já arredonda o ícone por conta própria.
  ['apple-touch-icon.png', 180, 0.62],
]

for (const [nome, tamanho, proporcao] of arquivos) {
  writeFileSync(path.join(destino, nome), png(tamanho, tamanho, desenhar(tamanho, proporcao)))
  console.log(`  ${nome} (${tamanho}×${tamanho})`)
}

// Favicon em SVG: nítido em qualquer tamanho e pesa quase nada.
// Raio de 21% do lado e símbolo a 62%, como manda o handoff.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="21" fill="#F5C518"/>
  <g transform="translate(19 19) scale(0.62)">
    <path d="M31.2 25.4 A32 32 0 1 0 72 23.6" fill="none" stroke="#0B0B0C" stroke-width="15"/>
    <path d="M66 4 L92 20 L64 36 Z" fill="#0B0B0C"/>
  </g>
</svg>
`
writeFileSync(path.join(raiz, 'public/favicon.svg'), svg)
console.log('  favicon.svg')
