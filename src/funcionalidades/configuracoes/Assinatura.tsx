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
import { Check, QrCode, CreditCard } from 'lucide-react'
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

      // "Você vai direto para o pagamento seguro" é promessa do topo da tela,
      // então cumprimos: a própria aba vai para a cobrança. Trocar a página é
      // permitido depois de uma chamada assíncrona; abrir aba nova seria
      // bloqueado pelo navegador, e a pessoa ficaria olhando para nada.
      if (data.link_da_fatura) {
        window.location.href = data.link_da_fatura as string
        return
      }
      // Sem link, a cobrança existe e chega por e-mail. É o único caminho em
      // que ainda vale mostrar uma janela.
      setFatura('sem-link')
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
          <p className="text-corpo text-em-superficie">
            Assinatura ativa no plano{' '}
            <strong>{planos.data?.find((p) => p.id === assinatura.data!.plano)?.nome}</strong>.
          </p>
          <p className="pt-1 text-apoio text-em-superficie-2">
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
          <p className="text-secao text-em-superficie">Escolha o plano ideal para sua oficina</p>
          <p className="pt-1 text-apoio text-em-superficie-2">
            Sem surpresas: ao clicar em “Assinar”, você vai direto para o
            pagamento seguro. O plano de teste é liberado na hora por 7 dias.
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
                    atual ? 'border-acento' : 'border-borda-em-superficie',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-secao text-em-superficie">{p.nome}</p>
                    {atual && (
                      <span className="rounded-badge bg-acento-suave px-2 py-0.5 text-micro text-em-superficie">
                        Atual
                      </span>
                    )}
                  </div>
                  <p className="pt-1 text-destaque text-em-superficie">
                    {gratuito ? 'Grátis' : moeda(Number(p.preco_mensal))}
                    {!gratuito && (
                      <span className="text-apoio text-em-superficie-2"> /mês</span>
                    )}
                  </p>

                  {/* Os benefícios vêm da tabela de planos: texto de venda muda
                      com frequência, e ter preço em SQL e frase em deploy seria
                      dois lugares para a mesma decisão. A frase que fala do que
                      o plano NÃO tem entra com o tique apagado. */}
                  <ul className="flex-1 space-y-1 pt-3">
                    {p.beneficios.map((beneficio) => {
                      const ausencia = /\(sem /i.test(beneficio)
                      return (
                        <li
                          key={beneficio}
                          className="flex gap-2 text-apoio text-em-superficie-2"
                        >
                          <Check
                            aria-hidden
                            size={16}
                            className={`mt-0.5 shrink-0 ${ausencia ? 'text-em-superficie-2 opacity-40' : 'text-sucesso-forte'}`}
                          />
                          {beneficio}
                        </li>
                      )
                    })}
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
                forma === valor ? 'border-acento bg-acento-suave' : 'border-borda-em-superficie',
              ].join(' ')}
            >
              <Icone aria-hidden size={22} className="mt-0.5 shrink-0 text-em-superficie" />
              <span>
                <span className="block text-corpo font-semibold text-em-superficie">{rotulo}</span>
                <span className="block text-apoio text-em-superficie-2">{detalhe}</span>
              </span>
            </button>
          ))}

          <p className="text-apoio text-em-superficie-2">
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

      {/* Só quando o provedor não devolveu o link ------------------------------ */}
      <Modal
        aberto={fatura !== null}
        aoFechar={() => setFatura(null)}
        titulo="Sua cobrança está pronta"
      >
        <div className="space-y-4">
          <p className="text-corpo text-em-superficie">
            A assinatura foi criada e a cobrança chega no seu e-mail em alguns
            minutos.
          </p>
          <p className="text-apoio text-em-superficie-2">
            Assim que o pagamento for identificado, o acesso se estende sozinho.
            Até lá, nada muda por aqui.
          </p>
        </div>
      </Modal>
    </div>
  )
}
