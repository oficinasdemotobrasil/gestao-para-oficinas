import { useEffect, useState } from 'react'
import { Copy, MessageCircle, QrCode, TriangleAlert } from 'lucide-react'
import { Botao } from '@/componentes/ui/Botao'
import { Modal } from '@/componentes/ui/Modal'
import { useToast } from '@/componentes/ui/Toast'
import { moeda } from '@/lib/formato'
import { gerarBrCode, chavePixValida } from '@/lib/pix'
import { enderecoDoWhatsApp } from '@/lib/whatsapp'
import { useAuth } from '@/auth/ProvedorAuth'
import type { ContaAReceber } from './api'

/**
 * O gerador de imagem do QR pesa e só é usado quando alguém cobra por PIX.
 * Chega sob demanda, como o jsPDF.
 */
let moduloQr: typeof import('qrcode') | null = null
const carregarQr = () => import('qrcode').then((m) => (moduloQr = m.default ?? m))

async function copiar(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch {
    // cai no caminho antigo
  }
  try {
    const area = document.createElement('textarea')
    area.value = texto
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const deu = document.execCommand('copy')
    document.body.removeChild(area)
    return deu
  } catch {
    return false
  }
}

export function CobrancaPix({
  conta,
  aberto,
  aoFechar,
}: {
  conta: ContaAReceber
  aberto: boolean
  aoFechar: () => void
}) {
  const { oficina } = useAuth()
  const toast = useToast()
  const [imagem, setImagem] = useState<string | null>(null)

  const falta = Number(conta.valor) - Number(conta.valor_recebido)

  const semChave = !oficina?.chave_pix || !oficina?.tipo_chave_pix
  const chaveTorta =
    !semChave && !chavePixValida(oficina!.chave_pix!, oficina!.tipo_chave_pix!)

  const codigo =
    semChave || chaveTorta
      ? ''
      : gerarBrCode({
          chave: oficina!.chave_pix!,
          tipoDaChave: oficina!.tipo_chave_pix!,
          nomeDoRecebedor: oficina!.nome,
          cidade: oficina!.cidade ?? '',
          valor: falta,
          identificador: conta.descricao,
        })

  useEffect(() => {
    if (!aberto || !codigo) return
    let vivo = true
    void (async () => {
      const qr = moduloQr ?? (await carregarQr())
      // Margem 1 e correção média: o código do PIX é longo, e margem grande
      // encolhe os módulos a ponto de a câmera do celular antigo não pegar.
      const url = await qr.toDataURL(codigo, { margin: 1, width: 320, errorCorrectionLevel: 'M' })
      if (vivo) setImagem(url)
    })()
    return () => {
      vivo = false
    }
  }, [aberto, codigo])

  const texto = [
    `Cobrança da ${oficina?.nome ?? 'oficina'}`,
    conta.descricao,
    `Valor: ${moeda(falta)}`,
    '',
    'PIX copia e cola:',
    codigo,
  ].join('\n')

  const whatsapp = enderecoDoWhatsApp(texto, conta.cliente?.telefone ?? null)

  return (
    <Modal larga aberto={aberto} aoFechar={aoFechar} titulo="Cobrar por PIX">
      {semChave || chaveTorta ? (
        <p className="mb-4 flex items-start gap-2 rounded-controle bg-atencao-fundo px-4 py-3 text-corpo text-atencao">
          <TriangleAlert aria-hidden size={20} className="mt-0.5 shrink-0" />
          {semChave
            ? 'Cadastre a chave PIX da oficina em Configurações para cobrar por aqui.'
            : 'A chave PIX cadastrada não tem o formato do tipo escolhido. Corrija em Configurações antes de cobrar.'}
        </p>
      ) : (
        <>
          <p className="pb-4 text-corpo text-claro-secundario">
            {conta.descricao} — <strong className="text-claro">{moeda(falta)}</strong>
          </p>

          {/* No celular o QR ocupa a largura e o código vem embaixo. No
              computador ficam lado a lado: quem cobra pelo balcão mostra a tela
              para o cliente escanear e, ao mesmo tempo, copia o código para
              mandar por outro caminho. */}
          <div className="flex flex-col gap-4 pb-4 desktop:flex-row desktop:items-start">
            <div className="flex justify-center desktop:shrink-0">
              {imagem ? (
                <img
                  src={imagem}
                  alt="QR Code do PIX"
                  className="h-64 w-64 rounded-controle bg-white p-2"
                />
              ) : (
                <div className="flex h-64 w-64 items-center justify-center rounded-controle bg-borda-clara">
                  <QrCode aria-hidden size={40} className="animate-pulse text-claro-secundario" />
                </div>
              )}
            </div>

            <p className="break-all rounded-controle bg-borda-clara/40 px-3 py-3 text-apoio text-claro-secundario desktop:min-w-0 desktop:flex-1">
              {codigo}
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-4">
            <Botao
              largo
              icone={<Copy aria-hidden size={20} />}
              onClick={() => {
                void copiar(codigo).then((deu) =>
                  deu
                    ? toast.sucesso('Código copiado. Cole na conversa do cliente.')
                    : toast.erro('Não foi possível copiar. Mostre o QR na tela.'),
                )
              }}
            >
              Copiar código
            </Botao>

            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-botao w-full items-center justify-center gap-2 rounded-controle border border-borda-clara px-5 text-corpo font-semibold text-claro"
            >
              <MessageCircle aria-hidden size={20} />
              Mandar pelo WhatsApp
            </a>
          </div>

          {/* O código estático não avisa quando é pago. Dizer isso na tela é a
              diferença entre a oficina conferir o extrato e achar que o sistema
              confere por ela. */}
          <p className="pt-4 text-apoio text-claro-secundario">
            Este código não avisa o sistema quando for pago. Depois de confirmar o
            recebimento no seu banco, volte aqui e marque como recebida.
          </p>
        </>
      )}
    </Modal>
  )
}
