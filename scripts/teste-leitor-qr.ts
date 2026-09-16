/**
 * Prova o caminho inteiro do leitor de QR sem precisar de câmera física:
 * gera um QR de verdade (mesma lib que já gera o QR do Pix), desenha os
 * módulos em pixels RGBA à mão — sem depender de canvas do navegador nem de
 * pacote de canvas no Node, que este projeto não tem — e manda esses pixels
 * pro MESMO decodificador (jsQR) que o componente da câmera usa.
 *
 * Isto testa a integração real entre gerar e ler, não um mock de nenhum dos
 * dois lados.
 *
 *   npm run teste:leitor-qr
 */
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import { chaveDoConteudoDoQr, chaveValida } from '../src/funcionalidades/notas-fiscais/chaveDeAcesso'

let passou = 0
let falhou = 0
const ok = (n: string, d = '') => { passou++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? ` (${d})` : ''}`) }
const erro = (n: string, d: string) => { falhou++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`) }

/** Desenha o QR em pixels RGBA — o mesmo formato que getImageData devolveria. */
function rasterizar(texto: string, escala = 6, margem = 4): { data: Uint8ClampedArray; width: number; height: number } {
  const { modules } = QRCode.create(texto, { errorCorrectionLevel: 'M' })
  const tamanhoQr = modules.size
  const lado = (tamanhoQr + margem * 2) * escala
  const data = new Uint8ClampedArray(lado * lado * 4).fill(255) // fundo branco

  for (let y = 0; y < tamanhoQr; y++) {
    for (let x = 0; x < tamanhoQr; x++) {
      const escuro = modules.data[y * tamanhoQr + x] === 1
      if (!escuro) continue
      // Cada módulo vira um quadrado de `escala` pixels.
      for (let py = 0; py < escala; py++) {
        for (let px = 0; px < escala; px++) {
          const pixelX = (x + margem) * escala + px
          const pixelY = (y + margem) * escala + py
          const i = (pixelY * lado + pixelX) * 4
          data[i] = 0
          data[i + 1] = 0
          data[i + 2] = 0
          data[i + 3] = 255
        }
      }
    }
  }
  return { data, width: lado, height: lado }
}

const chaveDeTeste = '9'.repeat(44)
const urlDoDanfe = `https://nfce.sefaz.pe.gov.br/nfce/consulta?p=${chaveDeTeste}|2|1|1|ABCD1234`

console.log('\n\x1b[1mGerar o QR e ler de volta com jsQR\x1b[0m')

const imagem = rasterizar(urlDoDanfe)
ok('o QR foi desenhado em pixels', `${imagem.width}×${imagem.height}`)

const lido = jsQR(imagem.data, imagem.width, imagem.height)
if (!lido) {
  erro('jsQR decodificou o QR gerado', 'voltou null — não achou nada na imagem')
} else if (lido.data === urlDoDanfe) {
  ok('o texto decodificado bate exatamente com o que foi gerado')
} else {
  erro('texto decodificado diferente do original', `veio "${lido.data}"`)
}

console.log('\n\x1b[1mExtrair a chave do conteúdo lido\x1b[0m')

if (lido) {
  const chaveExtraida = chaveDoConteudoDoQr(lido.data)
  chaveExtraida === chaveDeTeste
    ? ok('a chave de 44 dígitos foi extraída certinha da URL real decodificada')
    : erro('extração da chave', `veio "${chaveExtraida}"`)

  chaveExtraida && chaveValida(chaveExtraida)
    ? ok('a chave extraída passa na validação de forma')
    : erro('validação da chave extraída', 'não passou')
}

// Um QR que não tem chave nenhuma dentro — o caso "escaneei a etiqueta errada".
console.log('\n\x1b[1mQR sem chave de acesso\x1b[0m')
const imagemVazia = rasterizar('https://exemplo.com.br/nada-a-ver')
const lidoVazio = jsQR(imagemVazia.data, imagemVazia.width, imagemVazia.height)
if (lidoVazio && chaveDoConteudoDoQr(lidoVazio.data) === null) {
  ok('QR sem 44 dígitos dentro retorna null, em vez de inventar uma chave')
} else {
  erro('QR sem chave', `esperava null, veio "${lidoVazio ? chaveDoConteudoDoQr(lidoVazio.data) : 'jsQR não leu'}"`)
}

console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
process.exit(falhou > 0 ? 1 : 0)
