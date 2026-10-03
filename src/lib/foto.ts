/**
 * Reduz a foto da OS dentro do celular, antes de enviar.
 *
 * O navegador não deixa escolher a resolução da câmera: a foto sai do jeito
 * que o celular da pessoa está configurado — 12, 48, 200 megapixels, 3 a 10
 * MB. Então ela é tirada normal e reduzida aqui, e o original pesado nunca sai
 * do aparelho. No 4G da oficina, é a diferença entre um envio de segundos e
 * um que trava no meio.
 *
 * 1600 pixels no lado maior bastam para ver um risco na carenagem ou a rosca
 * de uma peça, e cabem na tela de qualquer celular sem perder nada. JPEG
 * porque é foto, não desenho: o PNG do logo (imagem.ts) aqui pesaria cinco
 * vezes mais.
 *
 * O banco recusa o que passar de 1 MB ou não for JPEG (migration 0079). Se uma
 * foto muito detalhada ainda passar do limite, a qualidade desce até caber.
 */

const LADO_MAIOR = 1600
const LIMITE_EM_BYTES = 1024 * 1024
const QUALIDADES = [0.8, 0.7, 0.6, 0.5]

export class FotoIlegivel extends Error {
  constructor() {
    super('Não consegui abrir essa foto. Tente tirar de novo.')
  }
}

function carregar(arquivo: Blob): Promise<HTMLImageElement> {
  return new Promise((aceitar, recusar) => {
    const endereco = URL.createObjectURL(arquivo)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(endereco)
      aceitar(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(endereco)
      recusar(new FotoIlegivel())
    }
    // O navegador já endireita a foto pela orientação gravada nela (EXIF):
    // `image-orientation: from-image` é o padrão em todos os atuais.
    img.src = endereco
  })
}

function desenhar(img: HTMLImageElement, ladoMaior: number, qualidade: number): Promise<Blob> {
  // Nunca aumenta: foto pequena continua do tamanho que veio.
  const escala = Math.min(1, ladoMaior / Math.max(img.naturalWidth, img.naturalHeight))
  const largura = Math.max(1, Math.round(img.naturalWidth * escala))
  const altura = Math.max(1, Math.round(img.naturalHeight * escala))

  const tela = document.createElement('canvas')
  tela.width = largura
  tela.height = altura
  const pincel = tela.getContext('2d')
  if (!pincel) throw new FotoIlegivel()
  pincel.imageSmoothingQuality = 'high'
  pincel.drawImage(img, 0, 0, largura, altura)

  return new Promise((aceitar, recusar) => {
    tela.toBlob(
      (blob) => (blob ? aceitar(blob) : recusar(new FotoIlegivel())),
      'image/jpeg',
      qualidade,
    )
  })
}

/** A foto pronta para enviar: JPEG, até 1600 px e até 1 MB. */
export async function reduzirFoto(arquivo: Blob): Promise<Blob> {
  const img = await carregar(arquivo)
  let ultima: Blob | null = null
  for (const qualidade of QUALIDADES) {
    ultima = await desenhar(img, LADO_MAIOR, qualidade)
    if (ultima.size <= LIMITE_EM_BYTES) return ultima
  }
  // Ainda grande na menor qualidade: só se a foto for absurdamente
  // detalhada. Um lado menor resolve sem chegar a borrar.
  return desenhar(img, 1200, 0.6)
}

/**
 * Uma versão menor, para caber no PDF da OS. O PDF vai pelo WhatsApp, e cinco
 * fotos em tamanho cheio fariam um arquivo de vários MB.
 */
export async function fotoParaDocumento(
  arquivo: Blob,
): Promise<{ dataUrl: string; largura: number; altura: number }> {
  const img = await carregar(arquivo)
  const blob = await desenhar(img, 900, 0.7)
  const dataUrl = await new Promise<string>((aceitar, recusar) => {
    const leitor = new FileReader()
    leitor.onload = () => aceitar(String(leitor.result))
    leitor.onerror = () => recusar(new FotoIlegivel())
    leitor.readAsDataURL(blob)
  })
  const escala = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight))
  return {
    dataUrl,
    largura: Math.round(img.naturalWidth * escala),
    altura: Math.round(img.naturalHeight * escala),
  }
}
