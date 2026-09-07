/**
 * Reduz o logo dentro do próprio navegador, antes de subir.
 *
 * A oficina manda o arquivo que tem — quase sempre o que veio do designer ou
 * uma foto da fachada, com vários megabytes. Guardar isso e baixar em toda
 * tela seria peso à toa numa oficina com internet ruim.
 *
 * Duas versões, porque os usos são diferentes: o PDF precisa de resolução, o
 * menu lateral não. Fazemos as duas aqui e não num servidor de imagem, porque
 * a conta já está aberta na máquina de quem escolheu o arquivo.
 *
 * A saída é sempre PNG: logo costuma ter fundo transparente, e JPEG trocaria a
 * transparência por um retângulo branco no meio do menu escuro.
 */

export const TAMANHO_MAXIMO_EM_BYTES = 2 * 1024 * 1024
export const TIPOS_ACEITOS = ['image/png', 'image/jpeg']

/** Largura da versão usada no PDF. */
export const LARGURA_GRANDE = 512
/** Largura da versão usada no menu e na tela de entrar. */
export const LARGURA_MINIATURA = 128

export type ProblemaNoArquivo = 'tipo' | 'tamanho' | 'ilegivel'

export const MENSAGEM: Record<ProblemaNoArquivo, string> = {
  tipo: 'O logo precisa ser PNG ou JPG.',
  tamanho: 'O arquivo passa de 2 MB. Escolha um menor.',
  ilegivel: 'Não consegui abrir essa imagem. Tente outro arquivo.',
}

export function conferirArquivo(arquivo: File): ProblemaNoArquivo | null {
  if (!TIPOS_ACEITOS.includes(arquivo.type)) return 'tipo'
  if (arquivo.size > TAMANHO_MAXIMO_EM_BYTES) return 'tamanho'
  return null
}

function carregarImagem(arquivo: File): Promise<HTMLImageElement> {
  return new Promise((aceitar, recusar) => {
    const endereco = URL.createObjectURL(arquivo)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(endereco)
      aceitar(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(endereco)
      recusar(new Error(MENSAGEM.ilegivel))
    }
    img.src = endereco
  })
}

function desenharEmPng(img: HTMLImageElement, larguraAlvo: number): Promise<Blob> {
  // Nunca aumenta: um logo de 60px virando 512 fica borrado, e borrado é pior
  // do que pequeno.
  const escala = Math.min(1, larguraAlvo / img.naturalWidth)
  const largura = Math.max(1, Math.round(img.naturalWidth * escala))
  const altura = Math.max(1, Math.round(img.naturalHeight * escala))

  const tela = document.createElement('canvas')
  tela.width = largura
  tela.height = altura
  const pincel = tela.getContext('2d')
  if (!pincel) throw new Error(MENSAGEM.ilegivel)
  pincel.imageSmoothingQuality = 'high'
  pincel.drawImage(img, 0, 0, largura, altura)

  return new Promise((aceitar, recusar) => {
    tela.toBlob(
      (blob) => (blob ? aceitar(blob) : recusar(new Error(MENSAGEM.ilegivel))),
      'image/png',
    )
  })
}

export type LogoReduzido = {
  grande: Blob
  miniatura: Blob
  largura: number
  altura: number
}

export async function reduzirLogo(arquivo: File): Promise<LogoReduzido> {
  const img = await carregarImagem(arquivo)
  const [grande, miniatura] = await Promise.all([
    desenharEmPng(img, LARGURA_GRANDE),
    desenharEmPng(img, LARGURA_MINIATURA),
  ])
  return { grande, miniatura, largura: img.naturalWidth, altura: img.naturalHeight }
}
