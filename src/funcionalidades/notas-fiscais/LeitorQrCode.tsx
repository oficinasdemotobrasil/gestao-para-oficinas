import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { Modal } from '@/componentes/ui/Modal'

interface Props {
  aberto: boolean
  aoFechar: () => void
  /** Devolve o texto cru do QR — quem chama decide o que fazer com ele. */
  aoLer: (conteudo: string) => void
}

/**
 * Aponta a câmera pro QR do DANFE e lê sozinho — sem precisar tirar foto,
 * sem precisar digitar 44 números com a mão suja de graxa.
 *
 * Roda inteiro no aparelho: nenhum quadro de vídeo sai do celular. `jsQR`
 * decodifica localmente a partir de pixels, não manda nada pra rede — o
 * mesmo motivo por trás de não pedir OCR de foto por um serviço pago aqui.
 */
export function LeitorQrCode({ aberto, aoFechar, aoLer }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const quadro = useRef<number>()
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    let stream: MediaStream | null = null
    let cancelado = false

    async function iniciar() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        if (video.current) {
          video.current.srcObject = stream
          await video.current.play()
        }
        procurar()
      } catch {
        // Sem câmera, sem permissão, ou navegador sem suporte (raro, mas
        // acontece em webview antigo). A tela continua usável pelo campo
        // de texto — o QR é atalho, não único caminho.
        setErro('Não consegui acessar a câmera. Digite a chave manualmente, ou permita o acesso e tente de novo.')
      }
    }

    function procurar() {
      const v = video.current
      const c = canvas.current
      if (!v || !c || v.readyState !== v.HAVE_ENOUGH_DATA) {
        quadro.current = requestAnimationFrame(procurar)
        return
      }
      c.width = v.videoWidth
      c.height = v.videoHeight
      const ctx = c.getContext('2d')
      if (!ctx) return
      ctx.drawImage(v, 0, 0, c.width, c.height)
      const imagem = ctx.getImageData(0, 0, c.width, c.height)
      const lido = jsQR(imagem.data, imagem.width, imagem.height)
      if (lido) {
        aoLer(lido.data)
        return // não agenda o próximo quadro: achou, para de gastar bateria
      }
      quadro.current = requestAnimationFrame(procurar)
    }

    void iniciar()

    return () => {
      cancelado = true
      if (quadro.current) cancelAnimationFrame(quadro.current)
      stream?.getTracks().forEach((t) => t.stop())
      setErro(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Escanear QR code">
      {erro ? (
        <p role="alert" className="rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro-forte">
          {erro}
        </p>
      ) : (
        <div className="overflow-hidden rounded-card bg-fundo">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={video} muted playsInline className="aspect-square w-full object-cover" />
        </div>
      )}
      <p className="pt-3 text-apoio text-em-superficie-2">
        Aponte para o QR code impresso na nota. A leitura acontece no celular — nada é enviado
        pela rede.
      </p>
      <canvas ref={canvas} className="hidden" />
    </Modal>
  )
}
