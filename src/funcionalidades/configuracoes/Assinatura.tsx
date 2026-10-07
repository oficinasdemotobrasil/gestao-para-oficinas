/**
 * Onde a oficina escolhe como pagar e assina.
 *
 * Desde a 0082 o GIRO tem um plano só, com tudo. A pergunta deixou de ser
 * "qual plano?" e virou "por quanto tempo?": mensal, trimestral, anual ou
 * vitalício. O anual vem em destaque, porque é a melhor oferta recorrente —
 * cada cartão mostra quanto sai por mês e quanto economiza, para a conta já
 * estar feita.
 *
 * É a tela em que alguém decide gastar dinheiro, então ela diz o que
 * normalmente fica escondido no rodapé:
 *
 *   • o total do parcelado, com a taxa do cartão, ANTES de pagar — a lei
 *     permite repassar a taxa só se o valor final aparecer antes;
 *   • que assinar não cobra na hora — gera a fatura, e o acesso só se estende
 *     quando o pagamento é identificado;
 *   • que cancelar não corta nada antes do fim do período já pago.
 *
 * Boleto ficou de fora de propósito: ele leva até dois dias para compensar, e
 * isso vira a oficina entrando em carência sem ter culpa.
 */
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Copy, CreditCard, Infinity as Infinito, Loader2, QrCode } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Botao } from '@/componentes/ui/Botao'
import { Modal } from '@/componentes/ui/Modal'
import { Campo, Selecao } from '@/componentes/ui/Campo'
import { useToast } from '@/componentes/ui/Toast'
import { useAuth } from '@/auth/ProvedorAuth'
import { supabase } from '@/lib/supabase'
import { traduzirErro } from '@/lib/erros'
import { moeda, data as formatarData } from '@/lib/formato'
import { cn } from '@/lib/cn'
import { AVISO_DE_ARREPENDIMENTO, CONTATO } from '@/funcionalidades/legal/documentos'
import type { PeriodoDePagamento, Preco } from '@/tipos/banco'
import {
  PERIODO_EM_DESTAQUE,
  RECURSOS_DO_PLANO,
  ROTULO_DO_PERIODO,
  SUFIXO_DO_PERIODO,
  economia,
  porMes,
  useParcelas,
  usePrecos,
  useVagasVitalicias,
  periodoDoEndereco,
} from './precos'

type Forma = 'PIX' | 'CREDIT_CARD'

interface Pix {
  imagem: string
  copia_e_cola: string
  expira_em: string | null
}

/** Uma cobrança gerada que ainda espera pagamento, como o provedor a vê. */
interface CobrancaEmAberto {
  periodo: PeriodoDePagamento
  forma: string
  valor: number
  total: number
  parcelas: number
  vencimento: string | null
  vencida: boolean
  /** Nada pago ainda nesta compra: a assinatura só existe no papel. */
  primeira: boolean
  link: string | null
  pix: Pix | null
}

/** O que cada forma quer dizer, conforme o período. */
function detalheDaForma(forma: Forma, periodo: PeriodoDePagamento, parcelado: boolean): string {
  if (forma === 'PIX') {
    if (periodo === 'vitalicio') return 'Cai na hora. Um pagamento só, para sempre.'
    if (periodo === 'mensal') return 'Cai na hora. Todo mês chega um código novo para pagar.'
    return `Cai na hora. A cada ${periodo === 'anual' ? 'ano' : 'três meses'} chega um código novo.`
  }
  if (periodo === 'vitalicio') return 'À vista ou parcelado na fatura do seu cartão.'
  if (parcelado) return 'Parcelado na fatura do seu cartão.'
  return 'Cobrado sozinho a cada período, sem você precisar lembrar.'
}

export function Assinatura() {
  const { oficina, recarregarUsuario } = useAuth()
  const toast = useToast()
  const fila = useQueryClient()

  const [periodo, setPeriodo] = useState<PeriodoDePagamento | null>(null)
  const [forma, setForma] = useState<Forma>('PIX')
  const [parcelas, setParcelas] = useState(1)
  const [enviando, setEnviando] = useState(false)
  const [fatura, setFatura] = useState<string | null>(null)
  const [pix, setPix] = useState<Pix | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [confirmado, setConfirmado] = useState(false)
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false)
  // Cancelar o que já foi pago pede a marca e a senha — conferidas no servidor.
  const [querCancelar, setQuerCancelar] = useState(false)
  const [senhaParaCancelar, setSenhaParaCancelar] = useState('')
  const [erroDaSenha, setErroDaSenha] = useState<string | null>(null)

  const precos = usePrecos()
  const vagas = useVagasVitalicias()
  const opcoesDeParcela = useParcelas(periodo && forma === 'CREDIT_CARD' ? periodo : null)

  const vitalicia = useQuery({
    queryKey: ['vitalicia', oficina?.id],
    enabled: Boolean(oficina),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('minha_oficina_e_vitalicia')
      if (error) throw error
      return Boolean(data)
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

  /*
   * A cobrança gerada e ainda não paga. Sem isto, quem fechava a página do
   * pagamento no meio via a assinatura como se estivesse em dia ("próxima
   * cobrança em…") e não tinha onde pagar. Antes de a função nova estar no ar,
   * a consulta falha e a tela segue como era.
   */
  const emAberto = useQuery({
    queryKey: ['cobranca-em-aberto', oficina?.id],
    enabled: Boolean(oficina) && vitalicia.data === false,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('assinatura', { body: { acao: 'em_aberto' } })
      if (error) throw error
      return {
        cobranca: (data?.em_aberto ?? null) as CobrancaEmAberto | null,
        /** Até quando vale o arrependimento desta assinatura (YYYY-MM-DD). Nulo fora do prazo. */
        arrependimentoAte: (data?.arrependimento_ate ?? null) as string | null,
      }
    },
  })

  /*
   * Enquanto o código PIX está na tela, perguntamos de tempos em tempos se o
   * pagamento caiu.
   *
   * Quem paga PIX paga pelo aplicativo do banco, no mesmo celular, e volta
   * para cá esperando ver alguma coisa mudar. A prova de que o dinheiro entrou
   * é o prazo de acesso mudar — inclusive para "sem prazo", no vitalício.
   */
  const prazoAntes = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (!pix || confirmado) return
    if (prazoAntes.current === undefined) prazoAntes.current = oficina?.acesso_ate ?? null
    const relogio = setInterval(() => void recarregarUsuario(), 6000)
    return () => clearInterval(relogio)
  }, [pix, confirmado, oficina?.acesso_ate, recarregarUsuario])

  useEffect(() => {
    if (!pix || confirmado || prazoAntes.current === undefined) return
    if ((oficina?.acesso_ate ?? null) !== prazoAntes.current) {
      setConfirmado(true)
      void fila.invalidateQueries({ queryKey: ['vitalicia'] })
      void fila.invalidateQueries({ queryKey: ['assinatura'] })
      void fila.invalidateQueries({ queryKey: ['cobranca-em-aberto'] })
    }
  }, [pix, confirmado, oficina?.acesso_ate, fila])

  // Trocar de período ou de forma volta para 1x: a escolha de parcelas era
  // de outra combinação.
  useEffect(() => setParcelas(1), [periodo, forma])

  /*
   * Quem veio do botão de compra da página de vendas (`?assinar=anual`) não
   * deveria ter de achar o cartão certo de novo: com o CPF ou CNPJ salvo, a
   * escolha de como pagar já abre naquele período.
   *
   * O pedido fica no endereço enquanto a compra está em andamento, e só sai
   * quando a pessoa desiste (fecha a janela) ou quando a cobrança é gerada.
   * Sair antes fazia o sistema esquecer a compra no meio do caminho: quem
   * tinha de corrigir o CPF salvava e caía no início, como cadastro comum.
   *
   * Não abre se não faz sentido: oficina vitalícia, assinatura em dia (exceto
   * para virar vitalícia) ou vagas esgotadas — aí o pedido é só descartado.
   */
  const [parametros, definirParametros] = useSearchParams()
  const pedido = periodoDoEndereco(parametros.get('assinar'))
  const documentoRecusado = parametros.get('doc') === 'recusado'
  const jaAbriu = useRef(false)

  /** A compra acabou (gerada ou desistida): o pedido sai do endereço. */
  function esquecerPedido() {
    if (!parametros.has('assinar') && !parametros.has('doc')) return
    const resto = new URLSearchParams(parametros)
    resto.delete('assinar')
    resto.delete('doc')
    // Tirar do endereço é uma navegação, e o roteador volta ao topo a cada
    // uma (ScrollRestoration). `preventScrollReset` segura a página onde está.
    definirParametros(resto, { replace: true, preventScrollReset: true })
  }

  function fecharEscolha() {
    setPeriodo(null)
    esquecerPedido()
  }

  /*
   * O provedor recusou o CPF ou CNPJ. A pessoa volta para o campo, lá no
   * topo das configurações, e o pedido continua no endereço — com o período
   * que ela tinha escolhido, mesmo que tenha vindo dos cartões daqui — para a
   * escolha abrir de novo assim que o documento certo for salvo.
   */
  function voltarAoDocumento(periodoEscolhido: PeriodoDePagamento) {
    setPeriodo(null)
    jaAbriu.current = false
    const novos = new URLSearchParams(parametros)
    novos.set('assinar', periodoEscolhido)
    novos.set('doc', 'recusado')
    definirParametros(novos, { replace: true })
    window.scrollTo({ top: 0 })
  }

  useEffect(() => {
    if (!pedido || !oficina?.cnpj || documentoRecusado || jaAbriu.current) return
    if (!precos.data || vitalicia.isLoading || assinatura.isLoading || vagas.isLoading) return
    jaAbriu.current = true
    const existe = precos.data.some((p) => p.periodo === pedido)
    const temVaga = pedido !== 'vitalicio' || (vagas.data ?? 0) > 0
    const semContrato = !assinatura.data || pedido === 'vitalicio'
    if (existe && temVaga && semContrato && !vitalicia.data) {
      requestAnimationFrame(() => document.getElementById('assinatura')?.scrollIntoView({ block: 'start' }))
      setPeriodo(pedido)
    } else {
      esquecerPedido()
    }
    // `esquecerPedido` muda a cada endereço e fica de fora de propósito: o
    // que decide abrir está listado, e `jaAbriu` garante uma vez só.
  }, [
    pedido, oficina?.cnpj, documentoRecusado, precos.data, vitalicia.isLoading, vitalicia.data,
    assinatura.isLoading, assinatura.data, vagas.isLoading, vagas.data,
  ])

  if (!oficina) return null

  const lista = precos.data ?? []
  const mensal = lista.find((p) => p.periodo === 'mensal')
  const escolhido = lista.find((p) => p.periodo === periodo)
  const opcaoEscolhida = opcoesDeParcela.data?.find((o) => o.parcelas === parcelas)
  const restam = vagas.data ?? 0

  async function assinar() {
    if (!periodo) return
    setEnviando(true)
    try {
      const { data, error } = await supabase.functions.invoke('assinatura', {
        body: { acao: 'assinar', periodo, forma, parcelas },
      })
      // A função explica no corpo; o erro do invoke só diz o número.
      const resposta = error ? (error as { context?: Response }).context : null
      const corpo = error ? (resposta ? await resposta.json().catch(() => null) : null) : data
      if (error || corpo?.erro) {
        if (corpo?.esgotado) void fila.invalidateQueries({ queryKey: ['vagas-vitalicias'] })
        // Documento faltando ou recusado pelo provedor: o conserto é no
        // campo lá em cima, e não nesta janela.
        if (corpo?.campo === 'cnpj' || /\b(CPF|CNPJ)\b/i.test(String(corpo?.erro ?? ''))) {
          voltarAoDocumento(periodo)
          return
        }
        throw new Error(corpo?.erro ?? 'Não foi possível criar a cobrança.')
      }

      await fila.invalidateQueries({ queryKey: ['assinatura'] })
      void fila.invalidateQueries({ queryKey: ['cobranca-em-aberto'] })
      setPeriodo(null)
      esquecerPedido()

      // No PIX a pessoa NÃO sai do aplicativo: o código aparece aqui mesmo.
      if (data.pix) {
        prazoAntes.current = oficina?.acesso_ate ?? null
        setPix(data.pix as Pix)
        return
      }
      // No cartão, os dados vão direto para o provedor, e isso não passa por
      // nós de propósito: dado de cartão que não toca no nosso sistema é dado
      // de cartão que não temos como vazar.
      if (data.link_da_fatura) {
        window.location.href = data.link_da_fatura as string
        return
      }
      setFatura('sem-link')
    } catch (e) {
      toast.erro(traduzirErro(e))
    } finally {
      setEnviando(false)
    }
  }

  function abrirCancelamento() {
    setQuerCancelar(false)
    setSenhaParaCancelar('')
    setErroDaSenha(null)
    setConfirmandoCancelamento(true)
  }

  async function cancelar(desistindo = false) {
    // Dentro do prazo de arrependimento, a mensagem final aponta a devolução.
    const noArrependimento = Boolean(emAberto.data?.arrependimentoAte)
    setEnviando(true)
    setErroDaSenha(null)
    try {
      const { data, error } = await supabase.functions.invoke('assinatura', {
        body: desistindo
          ? { acao: 'cancelar' }
          : { acao: 'cancelar', confirmado: querCancelar, senha: senhaParaCancelar },
      })
      // A função explica no corpo; o erro do invoke só diz o número.
      const resposta = error ? (error as { context?: Response }).context : null
      const corpo = error ? (resposta ? await resposta.json().catch(() => null) : null) : data
      if (error || corpo?.erro) {
        if (corpo?.campo === 'senha' || corpo?.campo === 'confirmado') {
          // Já houve pagamento: o caminho é a confirmação com senha, mesmo
          // que a tela tenha achado que era só desistir de uma cobrança.
          if (desistindo) abrirCancelamento()
          else setErroDaSenha(corpo.erro)
          return
        }
        throw new Error(corpo?.erro ?? 'Não foi possível cancelar.')
      }
      setSenhaParaCancelar('')
      await Promise.all([
        recarregarUsuario(),
        fila.invalidateQueries({ queryKey: ['assinatura'] }),
        fila.invalidateQueries({ queryKey: ['cobranca-em-aberto'] }),
      ])
      setConfirmandoCancelamento(false)
      toast.sucesso(
        desistindo
          ? 'Pronto, a cobrança foi cancelada. Escolha de novo como quer pagar.'
          : noArrependimento
            ? `Assinatura cancelada. Para a devolução, siga as instruções do aviso e escreva para ${CONTATO}.`
            : 'Assinatura cancelada. Seu acesso segue até o fim do período pago.',
      )
    } catch (e) {
      toast.erro(traduzirErro(e))
    } finally {
      setEnviando(false)
    }
  }

  // Vitalícia: não há o que assinar --------------------------------------------
  if (vitalicia.data) {
    return (
      <div className="flex items-start gap-3 rounded-card bg-superficie p-4 tablet:p-6">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-acento-suave">
          <Infinito aria-hidden size={22} className="text-em-superficie" />
        </span>
        <div>
          <p className="text-secao text-em-superficie">Sua oficina é vitalícia</p>
          <p className="pt-1 text-corpo text-em-superficie-2">
            Acesso a tudo o que o GIRO tem, para sempre, sem mensalidade. Obrigado por acreditar
            desde o começo.
          </p>
        </div>
      </div>
    )
  }

  const contrato = assinatura.data
  const parcelado = Boolean(contrato && contrato.parcelas > 1)
  const diasParaVencer = oficina.acesso_ate
    ? Math.round((new Date(`${oficina.acesso_ate}T12:00:00`).getTime() - Date.now()) / 86_400_000)
    : null
  // O anual parcelado não renova sozinho: perto do fim, a oficina assina de novo.
  const podeRenovar = parcelado && diasParaVencer !== null && diasParaVencer <= 30
  const aberta = emAberto.data?.cobranca ?? null
  const arrependimentoAte = emAberto.data?.arrependimentoAte ?? null
  // Gerou a cobrança e não pagou: o contrato existe, mas só no papel.
  const naoPagaAinda = Boolean(contrato && aberta?.primeira && aberta.periodo === contrato.periodo)

  /** Leva ao pagamento da cobrança em aberto: o PIX aqui mesmo, o cartão na página do provedor. */
  function pagarAgora(c: CobrancaEmAberto) {
    if (c.pix) {
      prazoAntes.current = oficina?.acesso_ate ?? null
      setConfirmado(false)
      setPix(c.pix)
      return
    }
    if (c.link) window.location.href = c.link
  }

  return (
    <div className="rounded-card bg-superficie p-4 tablet:p-6">
      {aberta && (aberta.pix || aberta.link) && (
        <div
          className={cn(
            'mb-5 rounded-controle border p-4',
            aberta.vencida ? 'border-erro bg-erro-fundo' : 'border-acento bg-acento-suave',
          )}
        >
          <p className="text-corpo font-semibold text-em-superficie">
            {aberta.vencida
              ? 'Pagamento atrasado'
              : aberta.primeira
                ? 'Falta pagar para ativar'
                : 'Cobrança esperando pagamento'}
          </p>
          <p className="pt-1 text-apoio text-em-superficie-2">
            {ROTULO_DO_PERIODO[aberta.periodo]} · {moeda(aberta.total)}
            {aberta.parcelas > 1 && ` em ${aberta.parcelas}x de ${moeda(aberta.valor)}`}
            {' '}· {aberta.forma === 'PIX' ? 'PIX' : 'cartão'}
            {aberta.vencimento &&
              ` · ${aberta.vencida ? 'venceu' : 'vence'} em ${formatarData(aberta.vencimento)}`}
            .
          </p>
          <div className="pt-3">
            <Botao type="button" compactoNoDesktop onClick={() => pagarAgora(aberta)}>
              {aberta.pix ? 'Pagar com PIX' : 'Pagar agora'}
            </Botao>
          </div>
        </div>
      )}

      {contrato && !podeRenovar ? (
        <>
          <p className="text-corpo text-em-superficie">
            Assinatura <strong>{ROTULO_DO_PERIODO[contrato.periodo].toLowerCase()}</strong>
            {contrato.valor ? (
              <>
                {' '}· {moeda(Number(contrato.valor))} {SUFIXO_DO_PERIODO[contrato.periodo]}
                {parcelado && ` (em ${contrato.parcelas}x no cartão)`}
              </>
            ) : null}
            .
          </p>
          <p className="pt-1 text-apoio text-em-superficie-2">
            {naoPagaAinda
              ? 'Ainda não foi paga: o plano passa a valer quando o pagamento cair. Quer trocar o período ou a forma de pagamento? Desista desta e escolha de novo.'
              : parcelado
                ? `Vale até ${oficina.acesso_ate ? formatarData(oficina.acesso_ate) : '—'}. Um mês antes, aparece aqui o botão para renovar.`
                : `Próxima cobrança em ${contrato.proxima_cobranca ? formatarData(contrato.proxima_cobranca) : 'a definir'}. Cancelar não corta nada antes do fim do período já pago.`}
          </p>
          {/* O parcelado só tem o que cancelar no prazo de arrependimento:
              depois dele, as parcelas seguem e ele não renova sozinho. */}
          {(naoPagaAinda || !parcelado || arrependimentoAte) && (
            <div className="pt-4">
              <Botao
                type="button"
                variante={naoPagaAinda ? 'contorno-no-card' : 'perigo'}
                carregando={enviando}
                onClick={() => (naoPagaAinda ? void cancelar(true) : abrirCancelamento())}
              >
                {naoPagaAinda ? 'Desistir e escolher de novo' : 'Cancelar assinatura'}
              </Botao>
            </div>
          )}

          {/* Quem já assina também pode virar vitalício: paga uma vez, e a
              mensalidade para sozinha quando o pagamento cair. */}
          {restam > 0 && (
            <div className="mt-5 rounded-controle border border-borda-em-superficie p-4">
              <p className="text-corpo font-semibold text-em-superficie">
                Pagar uma vez só e nunca mais
              </p>
              <p className="pt-1 text-apoio text-em-superficie-2">
                Vitalício por {moeda(Number(lista.find((p) => p.periodo === 'vitalicio')?.valor ?? 0))}
                {' '}— restam {restam} {restam === 1 ? 'vaga' : 'vagas'}. A assinatura atual é cancelada
                quando o pagamento cair.
              </p>
              <div className="pt-3">
                <Botao type="button" variante="contorno-no-card" compactoNoDesktop onClick={() => setPeriodo('vitalicio')}>
                  Quero o vitalício
                </Botao>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-secao text-em-superficie">
            {podeRenovar ? 'Hora de renovar' : 'Escolha como quer pagar'}
          </p>
          <p className="pt-1 text-apoio text-em-superficie-2">
            {podeRenovar
              ? `Seu anual vale até ${formatarData(oficina.acesso_ate!)}. Renove para não parar no meio de um atendimento.`
              : 'Um plano só, com tudo liberado. Quanto mais tempo, menos você paga por mês.'}
          </p>

          {/* A mesma lista da página de vendas (precos.ts): o que se promete
              lá é o que se lê aqui, na hora de pagar. Fechada por padrão para
              os cartões continuarem à vista no celular. */}
          <details className="group pt-3">
            <summary className="flex min-h-toque cursor-pointer list-none items-center gap-1.5 text-corpo font-medium text-acento-forte">
              Ver tudo o que está incluído
              <ChevronDown aria-hidden size={18} className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid gap-4 pt-2 tablet:grid-cols-2">
              {RECURSOS_DO_PLANO.map((g) => (
                <div key={g.grupo}>
                  <p className="text-apoio font-semibold text-em-superficie">{g.grupo}</p>
                  <ul className="space-y-1 pt-1">
                    {g.itens.map((item) => (
                      <li key={item} className="flex gap-2 text-apoio text-em-superficie-2">
                        <Check aria-hidden size={16} className="mt-0.5 shrink-0 text-sucesso-forte" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>

          <div className="grid gap-3 pt-4 tablet:grid-cols-2 desktop:grid-cols-4">
            {lista.map((p) => (
              <CartaoDoPeriodo
                key={p.periodo}
                preco={p}
                mensal={mensal}
                restam={restam}
                aoEscolher={() => setPeriodo(p.periodo)}
              />
            ))}
          </div>
        </>
      )}

      {/* Confirmar o cancelamento ---------------------------------------------
          Dentro dos 7 dias da contratação, o aviso de arrependimento; depois,
          a regra sem devolução, dita antes do clique e não depois. */}
      <Modal
        aberto={confirmandoCancelamento}
        aoFechar={() => setConfirmandoCancelamento(false)}
        titulo={arrependimentoAte ? AVISO_DE_ARREPENDIMENTO.titulo : 'Cancelar a assinatura?'}
      >
        {arrependimentoAte ? (
          <div className="flex flex-col gap-4 text-corpo text-em-superficie">
            <p className="rounded-controle bg-acento-suave px-3 py-2 text-apoio font-semibold text-em-superficie">
              O prazo de arrependimento desta assinatura vai até {formatarData(arrependimentoAte)}.
            </p>
            {AVISO_DE_ARREPENDIMENTO.blocos.map((bloco, i) => (
              <div key={i} className="flex flex-col gap-2">
                {bloco.titulo && <p className="font-semibold">{bloco.titulo}</p>}
                {bloco.paragrafos.map((p) => (
                  <p key={p} className="text-apoio leading-relaxed text-em-superficie-2">{p}</p>
                ))}
                {bloco.itens && (
                  <ul className="list-disc space-y-1 pl-5">
                    {bloco.itens.map((item) => (
                      <li key={item} className="text-apoio leading-relaxed text-em-superficie-2">{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2 text-corpo text-em-superficie-2">
            <p>
              Passados 7 dias da contratação, não há devolução de valores — nem do período em
              andamento, nem proporcional.
            </p>
            <p>
              As próximas cobranças param, e o acesso continua normalmente até{' '}
              <strong className="text-em-superficie">
                {oficina.acesso_ate ? formatarData(oficina.acesso_ate) : 'o fim do período pago'}
              </strong>
              .
            </p>
          </div>
        )}
        {/* A marca e a senha: cancelar o que foi pago é decisão do responsável,
            confirmada com a senha dele — o servidor confere as duas. */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (querCancelar && senhaParaCancelar) void cancelar()
          }}
          className="mt-5 flex flex-col gap-4 border-t border-borda-em-superficie pt-5"
        >
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={querCancelar}
              onChange={(e) => setQuerCancelar(e.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 accent-[rgb(var(--cor-acento))]"
            />
            <span className="text-apoio text-em-superficie">
              Li o aviso acima e confirmo que quero cancelar a assinatura.
            </span>
          </label>
          <Campo
            rotulo="Sua senha"
            type="password"
            autoComplete="current-password"
            dica="A mesma senha que você usa para entrar no GIRO."
            erro={erroDaSenha ?? undefined}
            value={senhaParaCancelar}
            onChange={(e) => {
              setSenhaParaCancelar(e.target.value)
              setErroDaSenha(null)
            }}
          />
          <div className="flex flex-col-reverse gap-2 tablet:flex-row tablet:justify-end">
            <Botao type="button" variante="contorno-no-card" compactoNoDesktop onClick={() => setConfirmandoCancelamento(false)}>
              Voltar
            </Botao>
            <Botao
              type="submit"
              variante="perigo"
              compactoNoDesktop
              carregando={enviando}
              disabled={!querCancelar || !senhaParaCancelar}
            >
              Cancelar a assinatura
            </Botao>
          </div>
        </form>
      </Modal>

      {/* Como pagar ------------------------------------------------------------ */}
      <Modal
        aberto={periodo !== null}
        aoFechar={fecharEscolha}
        titulo="Como você prefere pagar?"
      >
        {escolhido && (
          <div className="space-y-4">
            <div className="rounded-controle bg-acento-suave px-4 py-3">
              <p className="text-corpo font-semibold text-em-superficie">
                {ROTULO_DO_PERIODO[escolhido.periodo]} · {moeda(Number(escolhido.valor))}{' '}
                <span className="font-normal">{SUFIXO_DO_PERIODO[escolhido.periodo]}</span>
              </p>
              <p className="text-apoio text-em-superficie-2">
                {escolhido.periodo === 'vitalicio'
                  ? 'Pagamento único. Acesso a tudo, para sempre.'
                  : 'Cancelamento a qualquer momento; o acesso vale até o fim do período pago.'}
              </p>
            </div>

            {(['PIX', 'CREDIT_CARD'] as const).map((valor) => {
              const Icone = valor === 'PIX' ? QrCode : CreditCard
              return (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setForma(valor)}
                  aria-pressed={forma === valor}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-controle border p-4 text-left',
                    forma === valor ? 'border-acento bg-acento-suave' : 'border-borda-em-superficie',
                  )}
                >
                  <Icone aria-hidden size={22} className="mt-0.5 shrink-0 text-em-superficie" />
                  <span>
                    <span className="block text-corpo font-semibold text-em-superficie">
                      {valor === 'PIX' ? 'PIX' : 'Cartão de crédito'}
                    </span>
                    <span className="block text-apoio text-em-superficie-2">
                      {detalheDaForma(valor, escolhido.periodo, parcelas > 1)}
                    </span>
                  </span>
                </button>
              )
            })}

            {/* As parcelas: o total de cada opção aparece ANTES de pagar. */}
            {forma === 'CREDIT_CARD' && escolhido.parcelas_max > 1 && (
              <Selecao
                rotulo="Em quantas vezes"
                value={parcelas}
                onChange={(e) => setParcelas(Number(e.target.value))}
                dica={
                  parcelas > 1 && opcaoEscolhida
                    ? `O total inclui a taxa do parcelamento no cartão (${moeda(opcaoEscolhida.total - Number(escolhido.valor))}). À vista, você paga ${moeda(Number(escolhido.valor))}.`
                    : undefined
                }
              >
                {(opcoesDeParcela.data ?? [{ parcelas: 1, total: Number(escolhido.valor), valorParcela: Number(escolhido.valor) }]).map((o) => (
                  <option key={o.parcelas} value={o.parcelas}>
                    {o.parcelas === 1
                      ? `À vista: ${moeda(o.total)}`
                      : `${o.parcelas}x de ${moeda(o.valorParcela)} (total ${moeda(o.total)})`}
                  </option>
                ))}
              </Selecao>
            )}

            <p className="text-apoio text-em-superficie-2">
              Não trabalhamos com boleto: ele leva até dois dias para compensar, e isso deixaria a
              oficina em atraso sem ter culpa.
            </p>

            <div className="flex flex-col gap-3 pt-2 tablet:flex-row tablet:justify-end">
              <Botao type="button" variante="contorno-no-card" compactoNoDesktop onClick={fecharEscolha}>
                Voltar
              </Botao>
              <Botao type="button" compactoNoDesktop carregando={enviando} onClick={() => void assinar()}>
                Gerar a cobrança
              </Botao>
            </div>
          </div>
        )}
      </Modal>

      {/* O PIX, sem sair do aplicativo ------------------------------------------ */}
      <Modal
        aberto={pix !== null}
        aoFechar={() => {
          setPix(null)
          setConfirmado(false)
          prazoAntes.current = undefined
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
              {oficina.acesso_ate ? (
                <>
                  Seu acesso vale até <strong>{formatarData(oficina.acesso_ate)}</strong>. Não precisa
                  fazer mais nada.
                </>
              ) : (
                'Seu acesso agora é para sempre. Não precisa fazer mais nada.'
              )}
            </p>
            <div className="pt-2">
              <Botao
                type="button"
                onClick={() => {
                  setPix(null)
                  setConfirmado(false)
                  prazoAntes.current = undefined
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
          </div>
        )}
      </Modal>

      {/* Só quando o provedor não devolveu o link ------------------------------ */}
      <Modal aberto={fatura !== null} aoFechar={() => setFatura(null)} titulo="Sua cobrança está pronta">
        <div className="space-y-4">
          <p className="text-corpo text-em-superficie">
            A cobrança foi criada e chega no seu e-mail em alguns minutos.
          </p>
          <p className="text-apoio text-em-superficie-2">
            Assim que o pagamento for identificado, o acesso se estende sozinho.
          </p>
        </div>
      </Modal>
    </div>
  )
}

/**
 * Um período, como cartão de escolha. O anual vem em destaque; o vitalício
 * mostra as vagas que restam — o número real, urgência que não é inventada.
 */
function CartaoDoPeriodo({
  preco,
  mensal,
  restam,
  aoEscolher,
}: {
  preco: Preco
  mensal: Preco | undefined
  restam: number
  aoEscolher: () => void
}) {
  const destaque = preco.periodo === PERIODO_EM_DESTAQUE
  const vitalicio = preco.periodo === 'vitalicio'
  const esgotado = vitalicio && restam <= 0
  const mes = porMes(preco)
  const economiza = economia(preco, mensal)

  return (
    <div
      className={cn(
        'flex flex-col rounded-controle border p-4',
        destaque ? 'border-acento ring-1 ring-acento' : 'border-borda-em-superficie',
        esgotado && 'opacity-60',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-secao text-em-superficie">{ROTULO_DO_PERIODO[preco.periodo]}</p>
        {destaque && (
          <span className="rounded-badge bg-acento px-2 py-0.5 text-micro font-semibold text-em-superficie">
            Mais escolhido
          </span>
        )}
      </div>
      <p className="pt-1 text-destaque text-em-superficie">{moeda(Number(preco.valor))}</p>
      <p className="text-apoio text-em-superficie-2">{SUFIXO_DO_PERIODO[preco.periodo]}</p>

      <div className="flex-1 space-y-1 pt-3">
        {mes !== null && preco.periodo !== 'mensal' && (
          <p className="text-apoio font-medium text-em-superficie">Sai por {moeda(mes)} por mês</p>
        )}
        {economiza > 0 && (
          <p className="text-apoio font-semibold text-sucesso-forte">Economize {moeda(economiza)}</p>
        )}
        {preco.parcelas_max > 1 && (
          <p className="text-apoio text-em-superficie-2">Ou em até {preco.parcelas_max}x no cartão</p>
        )}
        {vitalicio && (
          <p className="text-apoio font-semibold text-atencao-forte">
            {esgotado ? 'Vagas esgotadas' : `Restam ${restam} de 30 vagas`}
          </p>
        )}
      </div>

      <div className="pt-4">
        <Botao
          type="button"
          largo
          disabled={esgotado}
          variante={destaque ? 'principal' : 'contorno-no-card'}
          onClick={aoEscolher}
        >
          {vitalicio ? 'Quero o vitalício' : 'Assinar'}
        </Botao>
      </div>
    </div>
  )
}
