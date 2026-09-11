/**
 * Assinar e cancelar, do lado da oficina.
 *
 * Ela fala com o provedor de pagamento; o aplicativo nunca fala. A chave da
 * cobrança vive só aqui, e o navegador jamais a vê.
 *
 * O que esta função NÃO faz, e é decisão de projeto: ela não libera acesso.
 * Assinar cria a cobrança; quem libera é o webhook, quando o dinheiro entra.
 * Se fosse aqui, bastaria clicar em "assinar" e fechar a tela para usar de
 * graça — e a diferença entre "pediu para pagar" e "pagou" é o negócio inteiro.
 *
 * Deploy:
 *   npx supabase functions deploy assinatura
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cabecalhosCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Só quem custa dinheiro. O gratuito não tem cobrança para criar. */
const PLANOS_PAGOS = ['essencial', 'completo']

/**
 * As formas de pagamento que a oficina escolhe.
 *
 * Boleto ficou de fora por decisão de produto: ele atrasa dois dias para
 * compensar, e numa mensalidade barata isso vira a oficina entrando em
 * carência todo mês sem ter culpa.
 *
 * Débito não entra porque o provedor não oferece débito em assinatura
 * recorrente — só em cobrança avulsa. Quem quiser pagar no débito paga por
 * PIX, que cai na hora e sai da mesma conta.
 */
const FORMAS = ['PIX', 'CREDIT_CARD'] as const
type Forma = (typeof FORMAS)[number]

interface Corpo {
  acao?: 'assinar' | 'cancelar' | 'ambiente' | 'conferir'
  plano?: string
  forma?: string
  motivo?: string
}

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cabecalhosCors, 'Content-Type': 'application/json' },
  })
}

const soDigitos = (v: string) => v.replace(/\D/g, '')

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cabecalhosCors })
  if (req.method !== 'POST') return responder({ erro: 'Método não permitido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const chaveAnon = Deno.env.get('SUPABASE_ANON_KEY')!
  const chaveServico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const chaveAsaas = Deno.env.get('ASAAS_API_KEY')
  const ambiente = (Deno.env.get('ASAAS_AMBIENTE') ?? 'sandbox').toLowerCase()

  if (!chaveAsaas) return responder({ erro: 'A cobrança ainda não está configurada.' }, 503)

  const baseAsaas =
    ambiente === 'producao' || ambiente === 'produção'
      ? 'https://api.asaas.com/v3'
      : 'https://api-sandbox.asaas.com/v3'

  const autorizacao = req.headers.get('Authorization') ?? ''
  if (!autorizacao) return responder({ erro: 'Faça login novamente.' }, 401)

  const comoUsuario = createClient(url, chaveAnon, {
    global: { headers: { Authorization: autorizacao } },
  })
  const { data: sessao, error: erroSessao } = await comoUsuario.auth.getUser()
  if (erroSessao || !sessao.user) return responder({ erro: 'Faça login novamente.' }, 401)

  const servico = createClient(url, chaveServico, { auth: { persistSession: false } })

  const { data: quem } = await servico
    .from('usuarios').select('oficina_id, perfil, ativo, nome, email')
    .eq('id', sessao.user.id).maybeSingle()

  if (!quem || !quem.ativo || quem.perfil !== 'admin') {
    return responder({ erro: 'Só o responsável pela oficina cuida da assinatura.' }, 403)
  }
  const oficinaId = quem.oficina_id as string

  let corpo: Corpo
  try {
    corpo = await req.json()
  } catch {
    return responder({ erro: 'Requisição inválida.' }, 400)
  }

  /** Toda conversa com o provedor passa por aqui. */
  async function noAsaas(caminho: string, opcoes: RequestInit = {}) {
    const resposta = await fetch(`${baseAsaas}${caminho}`, {
      ...opcoes,
      headers: {
        access_token: chaveAsaas!,
        'Content-Type': 'application/json',
        ...(opcoes.headers ?? {}),
      },
    })
    const dados = await resposta.json().catch(() => ({}))
    if (!resposta.ok) {
      const primeiro = dados?.errors?.[0]?.description
      throw new Error(primeiro ?? `O provedor de pagamento recusou (${resposta.status}).`)
    }
    return dados
  }

  // Em que ambiente estamos ------------------------------------------------------
  //
  // Existe para conferir a virada para produção sem criar cobrança nenhuma, e
  // para o suporte responder "está no ar de verdade?" sem adivinhar. Devolve só
  // o nome do ambiente e o endereço do provedor, que são públicos — nunca a
  // chave, e nunca nada que dependa dela.
  if (corpo.acao === 'ambiente') {
    // O PIX do provedor só funciona se a conta dele tiver uma chave PIX
    // registrada. Sem isso a cobrança sai como boleto, em silêncio — foi o que
    // aconteceu na primeira tentativa real, e é a pergunta certa a fazer.
    let chavesPix: { quantas: number; ativas: number } | { erro: string }
    try {
      const r = await fetch(`${baseAsaas}/pix/addressKeys`, {
        headers: { access_token: chaveAsaas! },
      })
      if (!r.ok) {
        chavesPix = { erro: `o provedor respondeu ${r.status}` }
      } else {
        const lista = await r.json()
        const chaves = (lista?.data ?? []) as { status?: string }[]
        chavesPix = {
          quantas: chaves.length,
          ativas: chaves.filter((c) => String(c.status) === 'ACTIVE').length,
        }
      }
    } catch (e) {
      chavesPix = { erro: (e as Error).message }
    }

    return responder({
      ambiente: baseAsaas.includes('sandbox') ? 'sandbox' : 'producao',
      base: baseAsaas,
      chave_configurada: Boolean(chaveAsaas),
      chaves_pix: chavesPix,
    })
  }

  // O que o provedor realmente criou ---------------------------------------------
  //
  // Existe porque a primeira cobrança real saiu como boleto mesmo tendo sido
  // pedida como PIX. Perguntar ao provedor o que ele guardou é a única forma
  // honesta de saber onde a escolha se perdeu.
  if (corpo.acao === 'conferir') {
    const { data: assinatura } = await servico
      .from('assinaturas').select('id_externo_assinatura')
      .eq('oficina_id', oficinaId).order('criado_em', { ascending: false })
      .limit(1).maybeSingle()

    if (!assinatura?.id_externo_assinatura) {
      return responder({ erro: 'Esta oficina não tem assinatura no provedor.' }, 404)
    }
    try {
      const noProvedor = await noAsaas(`/subscriptions/${assinatura.id_externo_assinatura}`)
      const cobrancas = await noAsaas(
        `/subscriptions/${assinatura.id_externo_assinatura}/payments`,
      )
      return responder({
        assinatura: {
          id: noProvedor?.id,
          billingType: noProvedor?.billingType,
          value: noProvedor?.value,
          cycle: noProvedor?.cycle,
          status: noProvedor?.status,
        },
        cobrancas: (cobrancas?.data ?? []).map((c: Record<string, unknown>) => ({
          id: c.id,
          billingType: c.billingType,
          status: c.status,
          value: c.value,
          dueDate: c.dueDate,
        })),
      })
    } catch (e) {
      return responder({ erro: (e as Error).message }, 400)
    }
  }

  // Cancelar ---------------------------------------------------------------------
  if (corpo.acao === 'cancelar') {
    const { data: assinatura } = await servico
      .from('assinaturas').select('id_externo_assinatura')
      .eq('oficina_id', oficinaId).eq('situacao', 'ativa').maybeSingle()

    if (assinatura?.id_externo_assinatura) {
      try {
        await noAsaas(`/subscriptions/${assinatura.id_externo_assinatura}`, { method: 'DELETE' })
      } catch (e) {
        return responder({ erro: (e as Error).message }, 400)
      }
    }

    // O acesso NÃO é tocado: vale até o fim do período já pago. Quem cancela no
    // dia 3 tendo pago até o dia 30 usa até o dia 30 — foi o que comprou.
    const { error } = await servico.rpc('encerrar_assinatura', {
      p_oficina: oficinaId,
      p_motivo: corpo.motivo ?? null,
    })
    if (error) return responder({ erro: error.message }, 400)
    return responder({ ok: true, cancelada: true })
  }

  // Assinar ----------------------------------------------------------------------
  if (corpo.acao !== 'assinar') return responder({ erro: 'Ação desconhecida.' }, 400)

  const plano = String(corpo.plano ?? '')
  if (!PLANOS_PAGOS.includes(plano)) {
    return responder({ erro: 'Escolha um plano pago.' }, 400)
  }

  const forma = String(corpo.forma ?? 'PIX').toUpperCase() as Forma
  if (!FORMAS.includes(forma)) {
    return responder(
      { erro: 'Forma de pagamento não aceita nesta assinatura. Use PIX ou cartão de crédito.' },
      400,
    )
  }

  const { data: oficina } = await servico
    .from('oficinas').select('nome, cnpj, telefone').eq('id', oficinaId).maybeSingle()
  const { data: dadosDoPlano } = await servico
    .from('planos').select('nome, preco_mensal').eq('id', plano).maybeSingle()

  if (!oficina || !dadosDoPlano) return responder({ erro: 'Oficina ou plano não encontrado.' }, 404)

  // O provedor exige documento para criar o cliente. Serve CPF ou CNPJ: muita
  // oficina de bairro fatura no CPF do dono e não tem empresa aberta. Dizer
  // isso agora, com o caminho da solução, é melhor do que devolver o erro cru
  // do provedor depois.
  const documento = soDigitos(oficina.cnpj ?? '')
  if (documento.length !== 11 && documento.length !== 14) {
    return responder(
      {
        erro: 'Antes de assinar, cadastre o CNPJ ou o CPF em Configurações. O provedor de pagamento exige.',
        campo: 'cnpj',
      },
      400,
    )
  }

  try {
    const { data: jaTem } = await servico
      .from('assinaturas').select('id, id_externo_cliente, situacao')
      .eq('oficina_id', oficinaId).order('criado_em', { ascending: false }).limit(1).maybeSingle()

    if (jaTem?.situacao === 'ativa') {
      return responder({ erro: 'Esta oficina já tem uma assinatura ativa.' }, 409)
    }

    // Reaproveita o cliente do provedor quando já existe: criar de novo geraria
    // dois cadastros para a mesma oficina e bagunçaria a conciliação depois.
    let idCliente = jaTem?.id_externo_cliente ?? null
    if (!idCliente) {
      const cliente = await noAsaas('/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: oficina.nome,
          cpfCnpj: documento,
          email: quem.email,
          mobilePhone: soDigitos(oficina.telefone ?? '') || undefined,
          externalReference: oficinaId,
        }),
      })
      idCliente = cliente.id
    }

    const primeiroVencimento = new Date()
    primeiroVencimento.setDate(primeiroVencimento.getDate() + 3)

    const assinatura = await noAsaas('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        customer: idCliente,
        billingType: forma,
        value: Number(dadosDoPlano.preco_mensal),
        nextDueDate: primeiroVencimento.toISOString().slice(0, 10),
        cycle: 'MONTHLY',
        description: `Gestão para Oficinas — plano ${dadosDoPlano.nome}`,
        externalReference: oficinaId,
      }),
    })

    await servico.from('assinaturas').insert({
      oficina_id: oficinaId,
      plano,
      situacao: 'ativa',
      proxima_cobranca: primeiroVencimento.toISOString().slice(0, 10),
      id_externo_cliente: idCliente,
      id_externo_assinatura: assinatura.id,
    })

    // O link da primeira fatura, para a oficina pagar agora. Note que NADA de
    // acesso muda aqui: quem libera é o webhook, quando o dinheiro entra.
    let linkDaFatura: string | null = null
    try {
      const cobrancas = await noAsaas(`/subscriptions/${assinatura.id}/payments`)
      linkDaFatura = cobrancas?.data?.[0]?.invoiceUrl ?? null
    } catch {
      // Sem o link a assinatura existe do mesmo jeito; o provedor manda por
      // e-mail. Não é motivo para desfazer nada.
    }

    return responder({
      ok: true,
      plano,
      valor: Number(dadosDoPlano.preco_mensal),
      vencimento: primeiroVencimento.toISOString().slice(0, 10),
      link_da_fatura: linkDaFatura,
    })
  } catch (e) {
    return responder({ erro: (e as Error).message }, 400)
  }
})
