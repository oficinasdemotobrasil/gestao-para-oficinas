/**
 * Onde a oficina escolhe o plano e assina.
 *
 * É a tela em que alguém decide gastar dinheiro, então ela diz três coisas que
 * normalmente ficam escondidas no rodapé:
 *
 *   • o que muda de um plano para o outro, sem eufemismo;
 *   • que assinar não cobra na hora — gera a fatura, e o acesso só se estende
 *     quando o pagamento é identificado;
 *   • que cancelar não corta nada antes do fim do período já pago.
 *
 * Boleto ficou de fora de propósito: ele leva até dois dias para compensar, e
 * numa mensalidade barata isso vira a oficina entrando em carência todo mês
 * sem ter culpa. Débito não entra porque o provedor não oferece débito em
 * assinatura recorrente — conferido na documentação dele, não suposto.
 */
import { useState } from 'react'
import { Check, ExternalLink, QrCode, CreditCard } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Botao } from '@/componentes/ui/Botao'
import { Modal } from '@/componentes/ui/Modal'
import { useToast } from '@/componentes/ui/Toast'
import { useAuth } from '@/auth/ProvedorAuth'
import { supabase } from '@/lib/supabase'
import { traduzirErro } from '@/lib/erros'
import { moeda, data as formatarData } from '@/lib/formato'
import type { Plano, PlanoOficina } from '@/tipos/banco'

type Forma = 'PIX' | 'CREDIT_CARD'

const FORMAS: { valor: Forma; rotulo: string; detalhe: string; Icone: typeof QrCode }[] = [
  {
    valor: 'PIX',
    rotulo: 'PIX',
    detalhe: 'Cai na hora. Todo mês chega um código novo para pagar.',
    Icone: QrCode,
  },
  {
    valor: 'CREDIT_CARD',
    rotulo: 'Cartão de crédito',
    detalhe: 'Cobrado sozinho todo mês, sem você precisar lembrar.',
    Icone: CreditCard,
  },
]

export function Assinatura() {
  const { oficina, recarregarUsuario } = useAuth()
  const toast = useToast()
  const fila = useQueryClient()

  const [escolhido, setEscolhido] = useState<PlanoOficina | null>(null)
  const [forma, setForma] = useState<Forma>('PIX')
  const [enviando, setEnviando] = useState(false)
  const [fatura, setFatura] = useState<string | null>(null)

  const planos = useQuery({
    queryKey: ['planos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('planos').select('*').eq('ativo', true).order('ordem')
      if (error) throw error
      return data as Plano[]
    },
  })

  const assinatura = useQuery({
    queryKey: ['assinatura', oficina?.id],
    enabled: Boolean(oficina),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assinaturas').select('*').eq('situacao', 'ativa')
        .order('criado_em', { ascending: false }).limit(1).maybeSingle()
      if (error) throw error
      return data
    },
  })

  if (!oficina) return null
  const temAssinatura = Boolean(assinatura.data)

  async function assinar() {
    if (!escolhido) return
    setEnviando(true)
    try {
      const { data, error } = await supabase.functions.invoke('assinatura', {
        body: { acao: 'assinar', plano: escolhido, forma },
      })
      if (error) {
        // A função explica no corpo; o erro do invoke só diz o número.
        const resposta = (error as { context?: Response }).context
        const corpo = resposta ? await resposta.json().catch(() => null) : null
        throw new Error(corpo?.erro ?? 'Não foi possível criar a assinatura.')
      }
      if (data?.erro) throw new Error(data.erro)

      await Promise.all([
        recarregarUsuario(),
        fila.invalidateQueries({ queryKey: ['assinatura'] }),
      ])
      setEscolhido(null)
      setFatura(data.link_da_fatura ?? null)
      if (!data.link_da_fatura) {
        toast.sucesso('Assinatura criada. A cobrança chega no seu e-mail.')
      }
    } catch (e) {
      toast.erro(traduzirErro(e))
    } finally {
      setEnviando(false)
    }
  }

  async function cancelar() {
    setEnviando(true)
    try {
      const { data, error } = await supabase.functions.invoke('assinatura', {
        body: { acao: 'cancelar' },
      })
      if (error) throw error
      if (data?.erro) throw new Error(data.erro)
      await Promise.all([
        recarregarUsuario(),
        fila.invalidateQueries({ queryKey: ['assinatura'] }),
      ])
      toast.sucesso('Assinatura cancelada. Seu acesso segue até o fim do período pago.')
    } catch (e) {
      toast.erro(traduzirErro(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="rounded-card bg-superficie p-4 tablet:p-6">
      {temAssinatura ? (
        <>
          <p className="text-corpo text-claro">
            Assinatura ativa no plano{' '}
            <strong>{planos.data?.find((p) => p.id === assinatura.data!.plano)?.nome}</strong>.
          </p>
          <p className="pt-1 text-apoio text-claro-secundario">
            Próxima cobrança em{' '}
            {assinatura.data!.proxima_cobranca
              ? formatarData(assinatura.data!.proxima_cobranca)
              : 'a definir'}
            . Cancelar não corta nada antes do fim do período já pago.
          </p>
          <div className="pt-4">
            <Botao
              type="button"
              variante="perigo"
              carregando={enviando}
              onClick={() => void cancelar()}
            >
              Cancelar assinatura
            </Botao>
          </div>
        </>
      ) : (
        <>
          <p className="text-corpo text-claro">Escolha o seu plano</p>
          <p className="pt-1 text-apoio text-claro-secundario">
            Assinar não cobra agora: gera a fatura. O acesso se estende quando o
            pagamento for identificado.
          </p>

          <div className="grid gap-3 pt-4 tablet:grid-cols-3">
            {(planos.data ?? []).map((p) => {
              const atual = p.id === oficina.plano
              const gratuito = Number(p.preco_mensal) === 0
              return (
                <div
                  key={p.id}
                  className={[
                    'flex flex-col rounded-controle border p-4',
                    atual ? 'border-acento' : 'border-borda-clara',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-secao text-claro">{p.nome}</p>
                    {atual && (
                      <span className="rounded-badge bg-acento-suave px-2 py-0.5 text-micro text-claro">
                        Atual
                      </span>
                    )}
                  </div>
                  <p className="pt-1 text-destaque text-claro">
                    {gratuito ? 'Grátis' : moeda(Number(p.preco_mensal))}
                    {!gratuito && (
                      <span className="text-apoio text-claro-secundario"> /mês</span>
                    )}
                  </p>

                  <ul className="flex-1 space-y-1 pt-3">
                    <li className="flex gap-2 text-apoio text-claro-secundario">
                      <Check aria-hidden size={16} className="mt-0.5 shrink-0 text-sucesso" />
                      {p.limite_colaboradores == null
                        ? 'Pessoas com acesso sem limite'
                        : `Até ${p.limite_colaboradores} pessoas com acesso`}
                    </li>
                    <li className="flex gap-2 text-apoio text-claro-secundario">
                      <Check
                        aria-hidden
                        size={16}
                        className={`mt-0.5 shrink-0 ${p.tem_financeiro ? 'text-sucesso' : 'text-claro-secundario opacity-40'}`}
                      />
                      {p.tem_financeiro ? 'Com o financeiro' : 'Sem o financeiro'}
                    </li>
                  </ul>

                  {!gratuito && (
                    <div className="pt-4">
                      <Botao
                        type="button"
                        largo
                        variante={atual ? 'contorno-no-card' : 'principal'}
                        onClick={() => setEscolhido(p.id)}
                      >
                        Assinar
                      </Botao>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Escolha da forma de pagamento --------------------------------------- */}
      <Modal
        aberto={escolhido !== null}
        aoFechar={() => setEscolhido(null)}
        titulo="Como você prefere pagar?"
      >
        <div className="space-y-4">
          {FORMAS.map(({ valor, rotulo, detalhe, Icone }) => (
            <button
              key={valor}
              type="button"
              onClick={() => setForma(valor)}
              aria-pressed={forma === valor}
              className={[
                'flex w-full items-start gap-3 rounded-controle border p-4 text-left',
                forma === valor ? 'border-acento bg-acento-suave' : 'border-borda-clara',
              ].join(' ')}
            >
              <Icone aria-hidden size={22} className="mt-0.5 shrink-0 text-claro" />
              <span>
                <span className="block text-corpo font-semibold text-claro">{rotulo}</span>
                <span className="block text-apoio text-claro-secundario">{detalhe}</span>
              </span>
            </button>
          ))}

          <p className="text-apoio text-claro-secundario">
            Não trabalhamos com boleto: ele leva até dois dias para compensar, e
            isso faria a oficina entrar em atraso todo mês sem ter culpa.
          </p>

          <div className="flex flex-col gap-3 pt-2 tablet:flex-row tablet:justify-end">
            <Botao
              type="button"
              variante="contorno-no-card"
              compactoNoDesktop
              onClick={() => setEscolhido(null)}
            >
              Voltar
            </Botao>
            <Botao
              type="button"
              compactoNoDesktop
              carregando={enviando}
              onClick={() => void assinar()}
            >
              Gerar a cobrança
            </Botao>
          </div>
        </div>
      </Modal>

      {/* O link da fatura ----------------------------------------------------- */}
      <Modal
        aberto={fatura !== null}
        aoFechar={() => setFatura(null)}
        titulo="Sua cobrança está pronta"
      >
        <div className="space-y-4">
          <p className="text-corpo text-claro">
            A assinatura foi criada. Pague a primeira cobrança para o acesso
            valer — até lá, nada muda por aqui.
          </p>
          <a
            href={fatura ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-toque items-center gap-2 rounded-controle bg-acento px-5 text-corpo font-semibold text-claro"
          >
            Abrir a cobrança
            <ExternalLink aria-hidden size={18} />
          </a>
          <p className="text-apoio text-claro-secundario">
            O link também vai para o seu e-mail. Assim que o pagamento for
            identificado, o acesso se estende sozinho.
          </p>
        </div>
      </Modal>
    </div>
  )
}
