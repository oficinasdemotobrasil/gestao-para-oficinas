import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Play,
  Pause,
  CheckCircle2,
  PackageCheck,
  MessageCircle,
  Download,
  Share2,
  XCircle,
  TriangleAlert,
} from 'lucide-react'
import { Botao } from '@/componentes/ui/Botao'
import { Modal } from '@/componentes/ui/Modal'
import { AreaTexto } from '@/componentes/ui/Campo'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { moeda, quantidade as formatarQuantidade } from '@/lib/formato'
import { useAuth } from '@/auth/ProvedorAuth'
import { usePermissoes } from '@/auth/usePermissoes'
import {
  mudarStatusDaOs,
  finalizarOs,
  cancelarOs,
  faltasParaFinalizar,
  type OrdemCompleta,
  type FaltaDeEstoque,
} from './api'
import { textoDeServicoPronto, enderecoDoWhatsApp } from './textoWhatsApp'
import type { StatusOS } from '@/tipos/banco'

/**
 * O jsPDF passa de 300 KB e chega sob demanda. O carregamento é na montagem da
 * tela, e não no toque, porque `navigator.share` só funciona dentro do mesmo
 * toque da pessoa — um `await` no meio faz o iPhone recusar.
 */
let moduloPdf: typeof import('./pdf') | null = null
const carregarModuloPdf = () => import('./pdf').then((m) => (moduloPdf = m))

function sabeCompartilharArquivo(): boolean {
  try {
    const teste = new File(['teste'], 'teste.pdf', { type: 'application/pdf' })
    return Boolean(navigator.canShare?.({ files: [teste] }))
  } catch {
    return false
  }
}

export function AcoesDaOrdem({ ordem }: { ordem: OrdemCompleta }) {
  const { oficina } = useAuth()
  const p = usePermissoes()
  const toast = useToast()
  const cache = useQueryClient()

  const [faltas, setFaltas] = useState<FaltaDeEstoque[] | null>(null)
  const [cancelando, setCancelando] = useState(false)
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

  /**
   * Invalida TODAS as ordens, e não só esta.
   *
   * Começar um serviço pausa a ordem que estava aberta em outra moto — e a tela
   * daquela ordem fica em cache dizendo "em andamento", com o cronômetro
   * correndo, depois de o banco já a ter pausado. O mecânico voltava para ela e
   * tocava em "terminei", que era recusado sem ele entender por quê.
   *
   * Sem o id na chave, o TanStack casa por prefixo e derruba as duas.
   */
  function recarregar() {
    void cache.invalidateQueries({ queryKey: ['ordem-servico'] })
    void cache.invalidateQueries({ queryKey: ['tempo-da-os'] })
    void cache.invalidateQueries({ queryKey: ['ordens'] })
    void cache.invalidateQueries({ queryKey: ['ordens-em-aberto'] })
  }

  const mudar = useMutation({
    mutationFn: (status: StatusOS) => mudarStatusDaOs(ordem.id, status),
    onSuccess: ({ pausouAOrdem }) => {
      recarregar()
      // Uma moto de cada vez: se o relógio estava ligado em outra ordem, ela
      // parou sozinha — e ficar sabendo depois, pelo tempo que não contou, seria
      // descobrir tarde demais.
      if (pausouAOrdem) {
        toast.aviso(`A OS ${pausouAOrdem.padStart(3, '0')} foi pausada: você só pode estar em uma moto por vez.`)
      }
    },
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  /** Pergunta o estoque antes de finalizar, para avisar em vez de só recusar. */
  const conferirEstoque = useMutation({
    mutationFn: () => faltasParaFinalizar(ordem.id),
    onSuccess: (lista) => {
      if (lista.length === 0) finalizar.mutate(false)
      else setFaltas(lista)
    },
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  const finalizar = useMutation({
    mutationFn: (permitirNegativo: boolean) => finalizarOs(ordem.id, permitirNegativo),
    onSuccess: () => {
      setFaltas(null)
      recarregar()
      void cache.invalidateQueries({ queryKey: ['produtos'] })
      void cache.invalidateQueries({ queryKey: ['repor'] })
      toast.sucesso('Serviço finalizado. As peças saíram do estoque.')
    },
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  const cancelar = useMutation({
    mutationFn: () => cancelarOs(ordem.id, motivo.trim() || null),
    onSuccess: () => {
      setCancelando(false)
      setMotivo('')
      recarregar()
      void cache.invalidateQueries({ queryKey: ['produtos'] })
      toast.sucesso('Ordem cancelada. O que tinha saído voltou para o estoque.')
    },
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  const texto = oficina ? textoDeServicoPronto(ordem, oficina.nome) : ''

  function comOPdf(acao: 'baixar' | 'compartilhar') {
    if (!oficina || !moduloPdf) return
    try {
      const doc = moduloPdf.gerarPdfDaOrdem(ordem, oficina)
      const nome = moduloPdf.nomeDoArquivoDaOrdem(ordem)
      if (acao === 'baixar') {
        doc.save(nome)
        return
      }
      const arquivo = new File([doc.output('blob')], nome, { type: 'application/pdf' })
      void navigator
        .share({ files: [arquivo], title: `OS ${String(ordem.numero).padStart(4, '0')}` })
        .catch(() => undefined)
    } catch (e) {
      toast.erro(traduzirErro(e))
    }
  }

  const mexendo = mudar.isPending || conferirEstoque.isPending || finalizar.isPending
  const emAberto = !['finalizada', 'entregue', 'cancelada'].includes(ordem.status)
  const pronta = ordem.status === 'finalizada' || ordem.status === 'entregue'

  return (
    <div className="flex flex-col gap-3 pt-8">
      {/* O andamento vem primeiro e grande: é o botão que a mão suja procura. */}
      {ordem.status === 'aberta' && (
        <Botao
          largo
          carregando={mexendo}
          icone={<Play aria-hidden size={20} />}
          onClick={() => mudar.mutate('em_andamento')}
        >
          Iniciar serviço
        </Botao>
      )}

      {ordem.status === 'em_andamento' && (
        <>
          <Botao
            largo
            carregando={mexendo}
            icone={<CheckCircle2 aria-hidden size={20} />}
            onClick={() => mudar.mutate('aguardando_conferencia')}
          >
            Terminei o serviço
          </Botao>
          <Botao
            largo
            variante="contorno"
            carregando={mexendo}
            icone={<Pause aria-hidden size={20} />}
            onClick={() => mudar.mutate('pausada')}
          >
            Pausar
          </Botao>
        </>
      )}

      {ordem.status === 'pausada' && (
        <Botao
          largo
          carregando={mexendo}
          icone={<Play aria-hidden size={20} />}
          onClick={() => mudar.mutate('em_andamento')}
        >
          Retomar
        </Botao>
      )}

      {ordem.status === 'aguardando_conferencia' && p.gerenciarOrdens && (
        <>
          <Botao
            largo
            carregando={mexendo}
            icone={<PackageCheck aria-hidden size={20} />}
            onClick={() => conferirEstoque.mutate()}
          >
            Conferi: finalizar serviço
          </Botao>
          <Botao
            largo
            variante="contorno"
            carregando={mexendo}
            icone={<Play aria-hidden size={20} />}
            onClick={() => mudar.mutate('em_andamento')}
          >
            Faltou algo: voltar ao serviço
          </Botao>
        </>
      )}

      {ordem.status === 'aguardando_conferencia' && !p.gerenciarOrdens && (
        <p className="rounded-controle bg-atencao-fundo px-4 py-3 text-corpo text-atencao">
          Serviço entregue para conferência. Quem confere é quem finaliza.
        </p>
      )}

      {ordem.status === 'finalizada' && p.gerenciarOrdens && (
        <Botao
          largo
          carregando={mexendo}
          icone={<CheckCircle2 aria-hidden size={20} />}
          onClick={() => mudar.mutate('entregue')}
        >
          Cliente retirou a moto
        </Botao>
      )}

      {/* Avisar o cliente e o comprovante só fazem sentido com a moto pronta. */}
      {pronta && p.gerenciarOrdens && (
        <>
          <a
            href={enderecoDoWhatsApp(texto, ordem.cliente?.telefone ?? null)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-botao w-full items-center justify-center gap-2 rounded-controle bg-acento px-5 text-corpo font-semibold text-claro active:bg-acento-pressionado"
          >
            <MessageCircle aria-hidden size={20} />
            Avisar que está pronta
          </a>

          <Botao
            largo
            variante="contorno"
            carregando={!pdfPronto}
            icone={<Download aria-hidden size={20} />}
            onClick={() => comOPdf('baixar')}
          >
            Baixar PDF da ordem
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
        </>
      )}

      {emAberto && p.gerenciarOrdens && (
        <Botao
          largo
          variante="perigo"
          icone={<XCircle aria-hidden size={20} />}
          onClick={() => setCancelando(true)}
        >
          Cancelar ordem
        </Botao>
      )}
      {ordem.status === 'finalizada' && p.gerenciarOrdens && (
        <Botao
          largo
          variante="perigo"
          icone={<XCircle aria-hidden size={20} />}
          onClick={() => setCancelando(true)}
        >
          Cancelar ordem
        </Botao>
      )}

      {/* Falta peça ------------------------------------------------------- */}
      <Modal
        aberto={faltas !== null}
        aoFechar={() => setFaltas(null)}
        titulo="Falta peça no estoque"
        rodape={
          <div className="flex flex-col gap-3">
            <Botao
              largo
              carregando={finalizar.isPending}
              onClick={() => finalizar.mutate(true)}
            >
              Finalizar mesmo assim
            </Botao>
            <Botao largo variante="contorno-no-card" onClick={() => setFaltas(null)}>
              Voltar e conferir
            </Botao>
          </div>
        }
      >
        <p className="pb-4 text-corpo text-claro-secundario">
          O cadastro do estoque não tem estas peças na quantidade da ordem. Se
          elas foram mesmo aplicadas na moto, pode finalizar: o saldo fica
          negativo e você acerta depois.
        </p>

        <div className="flex flex-col gap-2 pb-2">
          {(faltas ?? []).map((f) => (
            <div
              key={f.produto_id}
              className="flex items-start justify-between gap-3 rounded-controle border border-borda-clara px-4 py-3"
            >
              <span className="min-w-0">
                <span className="block truncate text-corpo font-medium text-claro">
                  {f.nome}
                </span>
                <span className="block text-apoio text-claro-secundario">
                  tem {formatarQuantidade(f.em_estoque)} {f.unidade} · precisa de{' '}
                  {formatarQuantidade(f.necessario)}
                </span>
              </span>
              <span className="shrink-0 rounded-badge bg-erro-fundo px-2.5 py-1 text-apoio font-medium text-erro">
                faltam {formatarQuantidade(f.falta)}
              </span>
            </div>
          ))}
        </div>

        <p className="flex items-start gap-2 pb-2 text-apoio text-claro-secundario">
          <TriangleAlert aria-hidden size={18} className="mt-0.5 shrink-0 text-atencao" />
          A saída fica marcada no extrato como feita sem saldo, para você achar
          depois onde o cadastro descolou da prateleira.
        </p>
      </Modal>

      {/* Cancelar --------------------------------------------------------- */}
      <Modal
        aberto={cancelando}
        aoFechar={() => setCancelando(false)}
        titulo="Cancelar a ordem"
        rodape={
          <Botao largo variante="perigo" carregando={cancelar.isPending} onClick={() => cancelar.mutate()}>
            Cancelar a ordem
          </Botao>
        }
      >
        <p className="pb-4 text-corpo text-claro-secundario">
          {ordem.status === 'finalizada'
            ? `As peças que saíram voltam para o estoque, e o valor de ${moeda(ordem.valor_total)} deixa de ser cobrado.`
            : 'A ordem fica guardada como cancelada, com o histórico do que aconteceu.'}
        </p>
        <AreaTexto
          rotulo="Motivo (opcional)"
          placeholder="Cliente desistiu, moto foi para outra oficina…"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </Modal>
    </div>
  )
}
