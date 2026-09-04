import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  MessageCircle,
  Copy,
  Download,
  Share2,
  CheckCircle2,
  XCircle,
  ClipboardList,
} from 'lucide-react'
import { Botao } from '@/componentes/ui/Botao'
import { Modal } from '@/componentes/ui/Modal'
import { AreaTexto } from '@/componentes/ui/Campo'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { useAuth } from '@/auth/ProvedorAuth'
import { obterOrdemDoOrcamento } from '@/funcionalidades/ordens/api'
import { ListaDeColaboradores } from '@/funcionalidades/ordens/EscolherResponsavel'
import { aprovarOrcamento, recusarOrcamento, marcarComoEnviado } from './api'
import { textoDoOrcamento, enderecoDoWhatsApp } from './textoWhatsApp'
import type { OrcamentoCompleto } from './api'
import type { StatusOrcamento } from '@/tipos/banco'

/**
 * Copia sem depender da API moderna.
 *
 * O navegador só entrega `navigator.clipboard` em contexto seguro. Em https
 * está lá; num celular acessando o app pelo IP da rede da oficina, não está —
 * e "copiar" que não copia é pior do que botão nenhum.
 */
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

/**
 * O jsPDF passa de 300 KB. Ele não entra no pacote que abre o aplicativo: chega
 * sozinho quando a tela do orçamento é aberta, e depois fica em cache.
 *
 * O carregamento é na montagem da tela, e não no toque do botão, porque
 * `navigator.share` só funciona dentro do mesmo toque da pessoa — um `await` no
 * meio do caminho faz o iPhone recusar o compartilhamento.
 */
let moduloPdf: typeof import('./pdf') | null = null

function carregarModuloPdf() {
  return import('./pdf').then((m) => {
    moduloPdf = m
    return m
  })
}

/** O navegador sabe compartilhar arquivo? No iPhone sabe; no Chrome do PC, não. */
function sabeCompartilharArquivo(): boolean {
  try {
    const teste = new File(['teste'], 'teste.pdf', { type: 'application/pdf' })
    return Boolean(navigator.canShare?.({ files: [teste] }))
  } catch {
    return false
  }
}

interface Props {
  orcamento: OrcamentoCompleto
  statusEfetivo: StatusOrcamento
  podeAgir: boolean
}

export function AcoesDoOrcamento({ orcamento, statusEfetivo, podeAgir }: Props) {
  const { oficina } = useAuth()
  const navegar = useNavigate()
  const toast = useToast()
  const cache = useQueryClient()

  const [aprovando, setAprovando] = useState(false)
  const [recusando, setRecusando] = useState(false)
  const [responsavelId, setResponsavelId] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [pdfPronto, setPdfPronto] = useState(moduloPdf !== null)

  useEffect(() => {
    if (moduloPdf) return
    let vivo = true
    void carregarModuloPdf().then(() => vivo && setPdfPronto(true))
    return () => {
      vivo = false
    }
  }, [])

  const decidido = orcamento.status === 'aprovado' || orcamento.status === 'recusado'

  // A OS só é procurada depois que o orçamento foi aprovado: antes disso não
  // existe, e a consulta seria uma ida ao servidor para receber nada.
  const { data: ordem } = useQuery({
    queryKey: ['ordem-do-orcamento', orcamento.id],
    queryFn: () => obterOrdemDoOrcamento(orcamento.id),
    enabled: orcamento.status === 'aprovado',
  })

  const texto = oficina ? textoDoOrcamento(orcamento, oficina.nome) : ''

  /** Rascunho vira "enviado" ao sair para o cliente — sem pedir confirmação. */
  const enviar = useMutation({
    mutationFn: () => marcarComoEnviado(orcamento.id),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['orcamento', orcamento.id] })
      void cache.invalidateQueries({ queryKey: ['orcamentos'] })
    },
    // Falhar aqui não atrapalha o que a pessoa queria fazer (mandar o texto),
    // então não vira alarme na tela.
    onError: () => undefined,
  })

  const aprovar = useMutation({
    mutationFn: () => aprovarOrcamento(orcamento.id, responsavelId!),
    onSuccess: (osId) => {
      setAprovando(false)
      void cache.invalidateQueries({ queryKey: ['orcamento', orcamento.id] })
      void cache.invalidateQueries({ queryKey: ['orcamentos'] })
      toast.sucesso('Orçamento aprovado. A ordem de serviço foi aberta.')
      navegar(`/ordens/${osId}`)
    },
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  const recusar = useMutation({
    mutationFn: () => recusarOrcamento(orcamento.id, motivo.trim() || null),
    onSuccess: () => {
      setRecusando(false)
      setMotivo('')
      void cache.invalidateQueries({ queryKey: ['orcamento', orcamento.id] })
      void cache.invalidateQueries({ queryKey: ['orcamentos'] })
      toast.sucesso('Orçamento marcado como recusado.')
    },
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  function aoCopiar() {
    void copiar(texto).then((deu) => {
      if (deu) {
        toast.sucesso('Texto copiado. Cole na conversa do cliente.')
        if (orcamento.status === 'rascunho') enviar.mutate()
      } else {
        toast.erro('Não foi possível copiar. Tire um print ou use o PDF.')
      }
    })
  }

  function comOPdf(acao: 'baixar' | 'compartilhar') {
    if (!oficina || !moduloPdf) return
    try {
      const doc = moduloPdf.gerarPdfDoOrcamento(orcamento, oficina)
      const nome = moduloPdf.nomeDoArquivo(orcamento)

      if (acao === 'baixar') {
        doc.save(nome)
        return
      }

      const arquivo = new File([doc.output('blob')], nome, { type: 'application/pdf' })
      void navigator
        .share({
          files: [arquivo],
          title: `Orçamento ${String(orcamento.numero).padStart(4, '0')}`,
        })
        .then(() => {
          if (orcamento.status === 'rascunho') enviar.mutate()
        })
        .catch(() => {
          // Cancelar o menu de compartilhamento também cai aqui. Não é erro.
        })
    } catch (e) {
      toast.erro(traduzirErro(e))
    }
  }

  return (
    <div className="flex flex-col gap-3 pt-8">
      {ordem && (
        <Botao
          largo
          icone={<ClipboardList aria-hidden size={20} />}
          onClick={() => navegar(`/ordens/${ordem.id}`)}
        >
          Ver ordem de serviço {String(ordem.numero).padStart(3, '0')}
        </Botao>
      )}

      <a
        href={enderecoDoWhatsApp(texto, orcamento.cliente?.telefone ?? null)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          if (orcamento.status === 'rascunho') enviar.mutate()
        }}
        className="inline-flex h-botao w-full items-center justify-center gap-2 rounded-controle bg-acento px-5 text-corpo font-semibold text-claro active:bg-acento-pressionado"
      >
        <MessageCircle aria-hidden size={20} />
        Enviar pelo WhatsApp
      </a>

      <Botao
        largo
        variante="contorno"
        icone={<Copy aria-hidden size={20} />}
        onClick={aoCopiar}
      >
        Copiar texto
      </Botao>

      <Botao
        largo
        variante="contorno"
        carregando={!pdfPronto}
        icone={<Download aria-hidden size={20} />}
        onClick={() => comOPdf('baixar')}
      >
        Baixar PDF
      </Botao>

      {sabeCompartilharArquivo() && (
        <Botao
          largo
          variante="contorno"
          carregando={!pdfPronto}
          icone={<Share2 aria-hidden size={20} />}
          onClick={() => comOPdf('compartilhar')}
        >
          Compartilhar PDF
        </Botao>
      )}

      {podeAgir && !decidido && (
        <div className="flex flex-col gap-3 border-t border-borda-escura pt-5">
          <Botao
            largo
            icone={<CheckCircle2 aria-hidden size={20} />}
            onClick={() => {
              setResponsavelId(null)
              setAprovando(true)
            }}
          >
            O cliente aprovou
          </Botao>
          <Botao
            largo
            variante="contorno"
            icone={<XCircle aria-hidden size={20} />}
            onClick={() => setRecusando(true)}
          >
            O cliente recusou
          </Botao>
        </div>
      )}

      <Modal
        aberto={aprovando}
        aoFechar={() => setAprovando(false)}
        titulo="Quem vai executar?"
        rodape={
          <Botao
            largo
            disabled={!responsavelId}
            carregando={aprovar.isPending}
            onClick={() => aprovar.mutate()}
          >
            Aprovar e abrir a ordem
          </Botao>
        }
      >
        <p className="pb-4 text-corpo text-claro-secundario">
          A ordem de serviço nasce aberta, com os itens deste orçamento. O estoque
          só é baixado quando o serviço for executado.
        </p>

        {statusEfetivo === 'expirado' && (
          <p className="mb-4 rounded-controle bg-atencao-fundo px-4 py-3 text-corpo text-atencao">
            Este orçamento passou da validade. Se os preços mudaram, cancele e
            duplique em vez de aprovar.
          </p>
        )}

        <ListaDeColaboradores
          ativa={aprovando}
          escolhidoId={responsavelId}
          aoEscolher={setResponsavelId}
        />
      </Modal>

      <Modal
        aberto={recusando}
        aoFechar={() => setRecusando(false)}
        titulo="O cliente recusou"
        rodape={
          <Botao largo carregando={recusar.isPending} onClick={() => recusar.mutate()}>
            Marcar como recusado
          </Botao>
        }
      >
        <p className="pb-4 text-corpo text-claro-secundario">
          O orçamento fica guardado como recusado. Dá para duplicar depois, se o
          cliente voltar atrás.
        </p>
        <AreaTexto
          rotulo="Motivo (opcional)"
          placeholder="Achou caro, vai fazer só a revisão…"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </Modal>
    </div>
  )
}
