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
import { useEffect, useState } from 'react'
import { Check, Copy, CreditCard, Loader2, QrCode } from 'lucide-react'
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

interface Pix {
  imagem: string
  copia_e_cola: string
  expira_em: string | null
}

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
  const [pix, setPix] = useState<Pix | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [confirmado, setConfirmado] = useState(false)

  const planos = useQuery({
    queryKey: ['planos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('planos').select('*').eq('ativo', true).order('ordem')
      if (error) throw error
      return data as Plano[]
    },
  })

  const pessoas = useQuery({
    queryKey: ['pessoas-ativas', oficina?.id],
    enabled: Boolean(oficina),
    queryFn: async () => {
      const { count, error } = await supabase
        .from('usuarios').select('*', { count: 'exact', head: true }).eq('ativo', true)
      if (error) throw error
      return count ?? 0
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

  /**
   * Enquanto o código está na tela, perguntamos de tempos em tempos se o
   * pagamento caiu.
   *
   * Quem paga PIX paga pelo aplicativo do banco, no mesmo celular, e volta
   * para cá esperando ver alguma coisa mudar. Mandar recarregar a página seria
   * transferir para a pessoa um trabalho que é nosso.
   */
  useEffect(() => {
    if (!pix || confirmado) return
    const relogio = setInterval(() => {
      void (async () => {
        await recarregarUsuario()
        const { data } = await supabase
          .from('assinaturas').select('proxima_cobranca')
          .eq('situacao', 'ativa').limit(1).maybeSingle()
        // O acesso passou a valer além do teste: o dinheiro entrou.
        if (data && oficina?.acesso_ate && data.proxima_cobranca === oficina.acesso_ate) {
          setConfirmado(true)
        }
      })()
    }, 6000)
    return () => clearInterval(relogio)
  }, [pix, confirmado, oficina?.acesso_ate, recarregarUsuario])

  if (!oficina) return null
  const temAssinatura = Boolean(assinatura.data)

  /**
   * O que a oficina perde ao escolher este plano.
   *
   * Dito ANTES de confirmar, não depois. Descobrir que o financeiro sumiu
   * porque você economizou vinte reais é o tipo de surpresa que faz cancelar.
   */
  const planoAtual = planos.data?.find((p) => p.id === oficina.plano)
  const planoEscolhido = planos.data?.find((p) => p.id === escolhido)
  const perdas: string[] = []
  if (planoAtual && planoEscolhido) {
    if (planoAtual.tem_financeiro && !planoEscolhido.tem_financeiro) {
      perdas.push('Você perde o módulo financeiro: contas a receber, contas a pagar e cobrança por PIX.')
    }
    const limite = planoEscolhido.limite_colaboradores
    const quantas = pessoas.data ?? 0
    if (limite != null && quantas > limite) {
      perdas.push(
        `A sua oficina tem ${quantas} pessoas com acesso e este plano permite ${limite}. ` +
          'Ninguém é desativado, mas você não consegue cadastrar mais ninguém até liberar vagas.',
      )
    }
  }

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

      // No PIX a pessoa NÃO sai do aplicativo: o código aparece aqui mesmo.
      // Sair para pagar é onde se perde gente — muda de contexto, não entende
      // de quem é a tela, desiste.
      if (data.pix) {
        setPix(data.pix as Pix)
        return
      }

      // No cartão, o provedor precisa receber os dados dele, e isso não passa
      // por nós de propósito: dado de cartão que não toca no nosso sistema é
      // dado de cartão que não temos como vazar.
      if (data.link_da_fatura) {
        window.location.href = data.link_da_fatura as string
        return
      }

      // Sem QR e sem link, a cobrança existe e chega por e-mail.
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

          {/* Enquanto o pagamento não é identificado, o plano que vale ainda é
              o antigo. Mostrar os dois números sem explicar foi o que fez
              alguém pagar 29,99, ver 49,99 na tela e não saber qual valia. */}
          {assinatura.data!.plano !== oficina.plano && (
            <p className="mt-2 rounded-controle bg-atencao-fundo px-4 py-3 text-apoio text-em-superficie">
              Você assinou o{' '}
              <strong>
                {planos.data?.find((p) => p.id === assinatura.data!.plano)?.nome}
              </strong>
              , e hoje ainda está valendo o{' '}
              <strong>{planos.data?.find((p) => p.id === oficina.plano)?.nome}</strong>. A
              troca acontece quando o pagamento for identificado.
            </p>
          )}

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
          {perdas.length > 0 && (
            <div
              role="alert"
              className="rounded-controle bg-atencao-fundo px-4 py-3 text-apoio text-em-superficie"
            >
              <p className="font-semibold">Atenção ao trocar de plano</p>
              <ul className="list-disc pt-1 pl-5">
                {perdas.map((perda) => (
                  <li key={perda}>{perda}</li>
                ))}
              </ul>
              <p className="pt-2">
                Nada é apagado — os dados continuam guardados e voltam a
                aparecer se você subir de plano de novo.
              </p>
            </div>
          )}

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

      {/* O PIX, sem sair do aplicativo ------------------------------------------ */}
      <Modal
        aberto={pix !== null}
        aoFechar={() => {
          setPix(null)
          setConfirmado(false)
        }}
        titulo={confirmado ? 'Pagamento confirmado' : 'Pague com PIX'}
      >
        {confirmado ? (
          <div className="space-y-3 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sucesso-fundo">
              <Check aria-hidden size={32} className="text-sucesso-forte" strokeWidth={3} />
            </span>
            <p className="text-secao text-em-superficie">Tudo certo!</p>
            <p className="text-corpo text-em-superficie-2">
              Seu plano está ativo e o acesso vale até{' '}
              <strong>
                {oficina.acesso_ate ? formatarData(oficina.acesso_ate) : 'a próxima cobrança'}
              </strong>
              . Não precisa fazer mais nada.
            </p>
            <div className="pt-2">
              <Botao
                type="button"
                onClick={() => {
                  setPix(null)
                  setConfirmado(false)
                }}
              >
                Voltar para a oficina
              </Botao>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {pix?.imagem && (
              <img
                src={`data:image/png;base64,${pix.imagem}`}
                alt="Código QR do PIX"
                className="mx-auto h-56 w-56 rounded-controle bg-superficie"
              />
            )}

            <div>
              <p className="pb-1 text-rotulo text-em-superficie-2">PIX copia e cola</p>
              <p className="max-h-24 overflow-y-auto break-all rounded-controle bg-borda-em-superficie/40 p-3 text-apoio text-em-superficie">
                {pix?.copia_e_cola}
              </p>
            </div>

            <Botao
              type="button"
              largo
              variante="contorno-no-card"
              icone={<Copy aria-hidden size={18} />}
              onClick={() => {
                void navigator.clipboard.writeText(pix?.copia_e_cola ?? '')
                setCopiado(true)
                setTimeout(() => setCopiado(false), 2500)
              }}
            >
              {copiado ? 'Copiado!' : 'Copiar o código'}
            </Botao>

            {/* A espera é nossa, não da pessoa: ela paga pelo banco e volta
                para cá; a tela é que tem de perceber. */}
            <p className="flex items-center justify-center gap-2 text-apoio text-em-superficie-2">
              <Loader2 aria-hidden size={16} className="animate-spin" />
              Esperando o pagamento. Pode pagar pelo seu banco e voltar aqui.
            </p>
            <p className="text-apoio text-em-superficie-2">
              Assim que o pagamento for identificado, esta tela muda sozinha e o
              seu plano passa a valer.
            </p>
          </div>
        )}
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
