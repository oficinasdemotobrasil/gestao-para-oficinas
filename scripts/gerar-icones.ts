/**
 * Gera os ícones do PWA sem depender de editor de imagem.
 *
 * Desenho: fundo quase preto com uma porca sextavada amarela — a ferramenta mais
 * reconhecível de uma oficina, e uma forma que continua legível a 32px na aba do
 * navegador. Troque por um logo de verdade quando houver um.
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

const RAIZ3 = Math.sqrt(3)

/** Hexágono regular de topo plano, centrado na origem. */
function dentroDoHexagono(x: number, y: number, r: number): boolean {
  const ax = Math.abs(x)
  const ay = Math.abs(y)
  return ay <= (RAIZ3 / 2) * r && RAIZ3 * ax + ay <= RAIZ3 * r
}

function desenhar(tamanho: number, proporcao: number): Uint8Array {
  const px = new Uint8Array(tamanho * tamanho * 3)
  const centro = tamanho / 2
  const raioHex = (tamanho * proporcao) / 2
  const raioFuro = raioHex * 0.42
  const amostras = 4 // suavização por supersampling

  for (let y = 0; y < tamanho; y++) {
    for (let x = 0; x < tamanho; x++) {
      let cobertura = 0
      for (let sy = 0; sy < amostras; sy++) {
        for (let sx = 0; sx < amostras; sx++) {
          const px0 = x + (sx + 0.5) / amostras - centro
          const py0 = y + (sy + 0.5) / amostras - centro
          const noHex = dentroDoHexagono(px0, py0, raioHex)
          const noFuro = px0 * px0 + py0 * py0 <= raioFuro * raioFuro
          if (noHex && !noFuro) cobertura++
        }
      }
      const a = cobertura / (amostras * amostras)
      const i = (y * tamanho + x) * 3
      for (let c = 0; c < 3; c++) {
        px[i + c] = Math.round(FUNDO[c] * (1 - a) + ACENTO[c] * a)
      }
    }
  }
  return px
}

// --- Saída ------------------------------------------------------------------

mkdirSync(destino, { recursive: true })

const arquivos: Array<[string, number, number]> = [
  // nome, tamanho, quanto do quadro a porca ocupa
  ['icon-192.png', 192, 0.7],
  ['icon-512.png', 512, 0.7],
  // Maskable: o sistema recorta as bordas, então a forma fica menor, dentro da
  // zona segura de 80%.
  ['icon-maskable-512.png', 512, 0.52],
  // O iOS já arredonda o ícone por conta própria.
  ['apple-touch-icon.png', 180, 0.7],
]

for (const [nome, tamanho, proporcao] of arquivos) {
  writeFileSync(path.join(destino, nome), png(tamanho, tamanho, desenhar(tamanho, proporcao)))
  console.log(`  ${nome} (${tamanho}×${tamanho})`)
}

// Favicon em SVG: nítido em qualquer tamanho e pesa quase nada.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#0B0B0C"/>
  <path d="M50 15 L80 32.5 L80 67.5 L50 85 L20 67.5 L20 32.5 Z" fill="#F5C518"/>
  <circle cx="50" cy="50" r="14.7" fill="#0B0B0C"/>
</svg>
`
writeFileSync(path.join(raiz, 'public/favicon.svg'), svg)
console.log('  favicon.svg')
