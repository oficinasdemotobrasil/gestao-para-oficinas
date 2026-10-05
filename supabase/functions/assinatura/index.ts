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

/**
 * Os períodos de pagamento do plano único (migration 0082). O preço de cada um
 * vem da tabela `precos`, nunca do navegador: quem manda o valor é o servidor.
 */
const PERIODOS = ['mensal', 'trimestral', 'anual', 'vitalicio'] as const
type Periodo = (typeof PERIODOS)[number]

/** O ciclo do provedor para cada período que renova sozinho. */
const CICLO: Record<string, string> = {
  mensal: 'MONTHLY',
  trimestral: 'QUARTERLY',
  anual: 'YEARLY',
}

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
  /** Só a tela antiga manda: ela assinava por plano, e sempre por mês. */
  plano?: string
  periodo?: string
  forma?: string
  /** Em quantas vezes no cartão. Só o anual e o vitalício parcelam. */
  parcelas?: number
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
    // O anual parcelado não tem assinatura no provedor: foi uma compra
    // parcelada no cartão, e as parcelas seguem na fatura do cliente. Cancelar
    // aqui só registra que ele não vai renovar; o acesso vale até o fim do ano
    // pago, como em qualquer cancelamento.
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

  // A tela antiga mandava só o plano e assinava por mês. Continua funcionando
  // até a tela nova chegar, para a ordem de publicação não importar.
  const periodo = String(corpo.periodo ?? (corpo.plano ? 'mensal' : '')) as Periodo
  if (!PERIODOS.includes(periodo)) {
    return responder({ erro: 'Escolha como quer pagar: mensal, trimestral, anual ou vitalício.' }, 400)
  }

  const forma = String(corpo.forma ?? 'PIX').toUpperCase() as Forma
  if (!FORMAS.includes(forma)) {
    return responder(
      { erro: 'Forma de pagamento não aceita nesta assinatura. Use PIX ou cartão de crédito.' },
      400,
    )
  }

  const { data: preco } = await servico
    .from('precos').select('valor, meses, parcelas_max, ativo').eq('periodo', periodo).maybeSingle()
  if (!preco?.ativo) return responder({ erro: 'Este período não está à venda.' }, 400)

  const parcelas = Math.trunc(Number(corpo.parcelas ?? 1))
  if (!Number.isFinite(parcelas) || parcelas < 1 || parcelas > preco.parcelas_max) {
    return responder({ erro: `Este período aceita até ${preco.parcelas_max}x.` }, 400)
  }
  // Parcelar é só no cartão: PIX é sempre à vista.
  if (parcelas > 1 && forma !== 'CREDIT_CARD') {
    return responder({ erro: 'Para parcelar, escolha cartão de crédito.' }, 400)
  }

  const valor = Number(preco.valor)
  // O total que o cliente paga: no parcelado, com a taxa do cartão (0082).
  let total = valor
  if (parcelas > 1) {
    const { data: comTaxa, error: erroTaxa } = await servico.rpc('valor_parcelado', {
      p_valor: valor,
      p_parcelas: parcelas,
    })
    if (erroTaxa) return responder({ erro: erroTaxa.message }, 500)
    total = Number(comTaxa)
  }

  const { data: oficina } = await servico
    .from('oficinas').select('nome, cnpj, telefone, acesso_ate').eq('id', oficinaId).maybeSingle()
  if (!oficina) return responder({ erro: 'Oficina não encontrada.' }, 404)

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
      .from('assinaturas').select('id, id_externo_cliente, situacao, parcelas')
      .eq('oficina_id', oficinaId).order('criado_em', { ascending: false }).limit(1).maybeSingle()

    if (periodo === 'vitalicio') {
      const { data: ehVitalicia } = await servico
        .from('vitalicios').select('id').eq('oficina_id', oficinaId).eq('situacao', 'paga').maybeSingle()
      if (ehVitalicia) return responder({ erro: 'Esta oficina já é vitalícia.' }, 409)

      const { data: restam } = await servico.rpc('vagas_vitalicias_restantes')
      if (Number(restam) <= 0) {
        return responder({ erro: 'As vagas vitalícias acabaram.', esgotado: true }, 409)
      }
    } else if (jaTem?.situacao === 'ativa') {
      // O anual parcelado não renova sozinho: perto do fim do ano pago, a
      // oficina assina de novo. Aí o contrato velho fecha e o novo começa.
      const diasParaVencer = oficina.acesso_ate
        ? (new Date(`${oficina.acesso_ate}T12:00:00Z`).getTime() - Date.now()) / 86_400_000
        : Infinity
      if (Number(jaTem.parcelas) > 1 && diasParaVencer <= 30) {
        await servico.rpc('encerrar_assinatura', { p_oficina: oficinaId, p_motivo: 'renovou' })
      } else {
        return responder({ erro: 'Esta oficina já tem uma assinatura ativa.' }, 409)
      }
    }

    // O cliente no provedor: o da última assinatura, ou o que já existe lá com
    // esta oficina como referência (comprou vitalício, por exemplo), ou um
    // novo. Criar de novo geraria dois cadastros para a mesma oficina e
    // bagunçaria a conciliação depois.
    let idCliente = jaTem?.id_externo_cliente ?? null
    if (!idCliente) {
      const existentes = await noAsaas(`/customers?externalReference=${oficinaId}`)
      idCliente = existentes?.data?.[0]?.id ?? null
    }
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

    const vencimento = new Date()
    vencimento.setDate(vencimento.getDate() + 3)
    const dataDoVencimento = vencimento.toISOString().slice(0, 10)
    const descricao =
      periodo === 'vitalicio'
        ? 'GIRO — acesso vitalício'
        : `GIRO — plano ${periodo}${parcelas > 1 ? ` em ${parcelas}x` : ''}`

    // A primeira cobrança (ou a única). NADA de acesso muda aqui: quem libera
    // é o aviso do provedor, quando o dinheiro entra.
    let primeira: Record<string, unknown> | null = null

    if (periodo !== 'vitalicio' && parcelas === 1) {
      // Renova sozinho: assinatura no provedor, no ciclo do período.
      const assinatura = await noAsaas('/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          customer: idCliente,
          billingType: forma,
          value: valor,
          nextDueDate: dataDoVencimento,
          cycle: CICLO[periodo],
          description: descricao,
          externalReference: oficinaId,
        }),
      })
      await servico.from('assinaturas').insert({
        oficina_id: oficinaId,
        plano: 'completo',
        situacao: 'ativa',
        periodo,
        valor,
        parcelas: 1,
        proxima_cobranca: dataDoVencimento,
        id_externo_cliente: idCliente,
        id_externo_assinatura: assinatura.id,
      })
      try {
        const cobrancas = await noAsaas(`/subscriptions/${assinatura.id}/payments`)
        primeira = cobrancas?.data?.[0] ?? null
      } catch {
        // Sem a primeira cobrança aqui, o provedor manda por e-mail do mesmo
        // jeito. Não é motivo para desfazer nada.
      }
    } else {
      // Cobrança única: o anual parcelado e o vitalício. No parcelado, o
      // provedor divide o total; a diferença de centavo vai na última parcela.
      const cobranca = await noAsaas('/payments', {
        method: 'POST',
        body: JSON.stringify({
          customer: idCliente,
          billingType: forma,
          dueDate: dataDoVencimento,
          description: descricao,
          externalReference: oficinaId,
          ...(parcelas > 1 ? { installmentCount: parcelas, totalValue: total } : { value: total }),
        }),
      })
      primeira = cobranca
      // O id que liga os pagamentos a esta compra: o do parcelamento, quando
      // parcelado (cada parcela é um pagamento diferente), senão o da cobrança.
      const idDaCompra = String(cobranca.installment ?? cobranca.id)

      if (periodo === 'vitalicio') {
        // A vaga fica reservada enquanto o pagamento não cai: 72 horas no PIX,
        // tempo de a pessoa pagar; o cartão aprova na hora.
        const { error: erroReserva } = await servico.rpc('reservar_vitalicio', {
          p_oficina: oficinaId,
          p_comprador: oficina.nome,
          p_email: quem.email,
          p_cobranca: idDaCompra,
          p_horas: forma === 'PIX' ? 72 : 24,
        })
        if (erroReserva) {
          // A última vaga foi vendida entre a conferência e a reserva. A
          // cobrança acabou de nascer e ninguém pagou: desfaz lá também.
          await noAsaas(
            cobranca.installment ? `/installments/${cobranca.installment}` : `/payments/${cobranca.id}`,
            { method: 'DELETE' },
          ).catch(() => undefined)
          return responder({ erro: 'As vagas vitalícias acabaram.', esgotado: true }, 409)
        }
      } else {
        await servico.from('assinaturas').insert({
          oficina_id: oficinaId,
          plano: 'completo',
          situacao: 'ativa',
          periodo,
          valor,
          parcelas,
          proxima_cobranca: null,
          id_externo_cliente: idCliente,
          id_externo_parcelamento: idDaCompra,
        })
      }
    }

    let pix: { imagem: string; copia_e_cola: string; expira_em: string | null } | null = null
    const idDaCobranca = primeira?.id ? String(primeira.id) : null
    // No PIX, trazemos o QR para cá em vez de mandar a oficina para a página
    // do provedor. Sair do aplicativo para pagar é onde se perde gente: a
    // pessoa muda de contexto, não entende de quem é a tela, e desiste.
    if (forma === 'PIX' && idDaCobranca) {
      try {
        const qr = await noAsaas(`/payments/${idDaCobranca}/pixQrCode`)
        if (qr?.payload) {
          pix = {
            imagem: qr.encodedImage ?? '',
            copia_e_cola: qr.payload,
            expira_em: qr.expirationDate ?? null,
          }
        }
      } catch {
        // Sem o QR, o link da fatura serve do mesmo jeito.
      }
    }

    return responder({
      ok: true,
      periodo,
      // `plano` e `valor` continuam saindo para a tela antiga.
      plano: 'completo',
      valor: total,
      parcelas,
      valor_parcela: Math.round((total / parcelas) * 100) / 100,
      vencimento: dataDoVencimento,
      forma,
      link_da_fatura: (primeira?.invoiceUrl as string | undefined) ?? null,
      cobranca_id: idDaCobranca,
      pix,
    })
  } catch (e) {
    return responder({ erro: (e as Error).message }, 400)
  }
})
