/**
 * A administração da plataforma. Roda fora do aplicativo do cliente.
 *
 * Esta é a única porta que enxerga todas as oficinas — e ela existe aqui, e não
 * numa tela do app, por decisão de arquitetura da Fase 4 (opção A): o aplicativo
 * do cliente não ganha nenhum perfil, rota ou condição capaz de ver outra
 * oficina. Assim o teste de isolamento continua valendo sem exceção para
 * ninguém, e não há um `if` que, desligado por engano, vaze dado entre clientes.
 *
 * Quem pode chamar: apenas contas listadas em `admins_plataforma`. Essas contas
 * NÃO têm linha em `usuarios` — sem ela, `oficina_do_usuario()` devolve nulo e
 * elas ficam cegas no aplicativo do cliente, o que é exatamente o desejado.
 *
 * A primeira conta de plataforma tem de ser inserida à mão no SQL Editor. Não há
 * caminho automático de propósito: uma porta que se abre sozinha para a primeira
 * pessoa é uma porta aberta.
 *
 * Deploy:
 *   npx supabase functions deploy plataforma
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cabecalhosCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PLANOS = ['gratuito', 'essencial', 'completo'] as const
const SITUACOES = ['ativa', 'suspensa', 'cancelada'] as const
type Plano = (typeof PLANOS)[number]
type Situacao = (typeof SITUACOES)[number]

interface Corpo {
  acao?: 'listar' | 'criar' | 'plano' | 'situacao' | 'prazo' | 'reprocessar'
  oficina_id?: string
  plano?: Plano
  situacao?: Situacao
  motivo?: string
  /**
   * Para 'prazo': até quando o acesso vale, em aaaa-mm-dd. Nulo é sem prazo —
   * é assim que se dá cortesia. Estender teste, liberar bloqueio e cortesia
   * são a mesma operação vista de ângulos diferentes.
   */
  acesso_ate?: string | null
  // Só para 'criar'.
  nome?: string
  admin_nome?: string
  admin_email?: string
  admin_senha?: string
}

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cabecalhosCors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cabecalhosCors })
  if (req.method !== 'POST') return responder({ erro: 'Método não permitido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const chaveAnon = Deno.env.get('SUPABASE_ANON_KEY')!
  const chaveServico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const autorizacao = req.headers.get('Authorization') ?? ''
  if (!autorizacao) return responder({ erro: 'Faça login novamente.' }, 401)

  // Quem está chamando: descoberto pelo token, como qualquer consulta do app.
  const comoUsuario = createClient(url, chaveAnon, {
    global: { headers: { Authorization: autorizacao } },
  })
  const { data: sessao, error: erroSessao } = await comoUsuario.auth.getUser()
  if (erroSessao || !sessao.user) return responder({ erro: 'Faça login novamente.' }, 401)

  // A chave que ignora o RLS. Daqui para baixo, tudo é permitido pelo banco —
  // então a permissão passa a ser responsabilidade das linhas abaixo.
  const servico = createClient(url, chaveServico, { auth: { persistSession: false } })

  const { data: souAdmin } = await servico
    .from('admins_plataforma')
    .select('usuario_id')
    .eq('usuario_id', sessao.user.id)
    .maybeSingle()

  if (!souAdmin) {
    // A mesma resposta para quem não é administrador e para quem não existe: a
    // diferença entre as duas só serviria para alguém descobrir quem é.
    return responder({ erro: 'Esta área é da administração da plataforma.' }, 403)
  }

  let corpo: Corpo
  try {
    corpo = await req.json()
  } catch {
    return responder({ erro: 'Requisição inválida.' }, 400)
  }

  // Listar --------------------------------------------------------------------
  //
  // A conta de uso (pessoas, ordens do mês, orçamentos do mês, último acesso)
  // é feita no banco, numa consulta só. Trazer as tabelas para cá e somar em
  // JavaScript funcionaria com cinco oficinas e não com quinhentas.
  //
  // As funções plataforma_* têm o execute revogado de authenticated e anon
  // (migration 0046): só a service_role chega nelas.
  if (corpo.acao === 'listar') {
    const [lista, indicadores, painel] = await Promise.all([
      servico.rpc('plataforma_oficinas'),
      servico.rpc('plataforma_indicadores'),
      servico.rpc('plataforma_painel'),
    ])
    if (lista.error) return responder({ erro: lista.error.message }, 500)
    if (indicadores.error) return responder({ erro: indicadores.error.message }, 500)
    if (painel.error) return responder({ erro: painel.error.message }, 500)

    return responder({
      oficinas: lista.data ?? [],
      indicadores: indicadores.data ?? {},
      painel: painel.data ?? {},
    })
  }

  // Reprocessar um pagamento que o sistema não soube ------------------------------
  //
  // O provedor avisa por webhook, e webhook se perde: ele estava fora do ar, a
  // rede falhou, ou — como aconteceu aqui — ele foi cadastrado depois de o
  // cliente pagar, e o provedor não reenvia o que passou.
  //
  // Sem esta porta, o único conserto seria editar o banco na mão. Com ela, a
  // plataforma relê a cobrança no provedor e aplica o que deveria ter sido
  // aplicado — conferindo lá, como o webhook faz, e nunca acreditando em quem
  // pediu.
  if (corpo.acao === 'reprocessar') {
    if (!corpo.oficina_id) return responder({ erro: 'Falta a oficina.' }, 400)

    const chaveAsaas = Deno.env.get('ASAAS_API_KEY')
    if (!chaveAsaas) return responder({ erro: 'A cobrança não está configurada.' }, 503)
    const ambiente = (Deno.env.get('ASAAS_AMBIENTE') ?? 'sandbox').toLowerCase()
    const base =
      ambiente === 'producao' || ambiente === 'produção'
        ? 'https://api.asaas.com/v3'
        : 'https://api-sandbox.asaas.com/v3'

    const { data: assinatura } = await servico
      .from('assinaturas').select('id_externo_assinatura, plano')
      .eq('oficina_id', corpo.oficina_id).eq('situacao', 'ativa')
      .order('criado_em', { ascending: false }).limit(1).maybeSingle()

    if (!assinatura?.id_externo_assinatura) {
      return responder({ erro: 'Esta oficina não tem assinatura ativa no provedor.' }, 404)
    }

    let cobrancas: { data?: Record<string, unknown>[] }
    try {
      const r = await fetch(
        `${base}/subscriptions/${assinatura.id_externo_assinatura}/payments`,
        { headers: { access_token: chaveAsaas } },
      )
      if (!r.ok) return responder({ erro: `O provedor respondeu ${r.status}.` }, 502)
      cobrancas = await r.json()
    } catch (e) {
      return responder({ erro: (e as Error).message }, 502)
    }

    const pagas = ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH']
    const paga = (cobrancas.data ?? [])
      .filter((c) => pagas.includes(String(c.status)))
      .sort((a, b) => String(b.dueDate).localeCompare(String(a.dueDate)))[0]

    if (!paga) {
      return responder({ erro: 'Nenhuma cobrança paga encontrada nesta assinatura.' }, 404)
    }

    // Mesma conta do webhook: a próxima data que o provedor informa, ou trinta
    // dias a partir do vencimento PAGO — nunca a partir de hoje, senão quem
    // paga atrasado perde os dias de atraso.
    const proxima = paga.nextDueDate ?? paga.dueDate
    const ate = new Date(`${String(proxima)}T12:00:00Z`)
    if (!paga.nextDueDate) ate.setDate(ate.getDate() + 30)
    const acessoAte = ate.toISOString().slice(0, 10)

    const { error: erroAplicar } = await servico.rpc('registrar_pagamento', {
      p_oficina: corpo.oficina_id,
      p_acesso_ate: acessoAte,
      p_plano: assinatura.plano,
    })
    if (erroAplicar) return responder({ erro: erroAplicar.message }, 500)

    // Fica registrado como reprocessamento, e não como evento do provedor: no
    // dia em que alguém for reconstruir o que houve, a diferença importa.
    await servico.from('eventos_asaas').insert({
      evento_id: `reprocessado_${paga.id}_${Date.now()}`,
      tipo: 'REPROCESSADO_PELA_PLATAFORMA',
      conteudo: paga,
      oficina_id: corpo.oficina_id,
      aplicado: true,
      observacao: `relido no provedor por ${sessao.user.email}; plano ${assinatura.plano}; acesso até ${acessoAte}`,
    })

    return responder({
      ok: true,
      cobranca: paga.id,
      plano: assinatura.plano,
      acesso_ate: acessoAte,
    })
  }

  // Prazo de acesso -------------------------------------------------------------
  // Estender teste, liberar um bloqueio e dar cortesia são a mesma coisa: mudar
  // até quando o acesso vale. Nulo é sem prazo.
  if (corpo.acao === 'prazo') {
    if (!corpo.oficina_id) return responder({ erro: 'Falta a oficina.' }, 400)
    const ate = corpo.acesso_ate ?? null
    if (ate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
      return responder({ erro: 'Data inválida.' }, 400)
    }
    const { error } = await servico.rpc('plataforma_definir_prazo', {
      p_oficina: corpo.oficina_id,
      p_acesso_ate: ate,
    })
    if (error) return responder({ erro: error.message }, 400)
    return responder({ ok: true, acesso_ate: ate })
  }

  // Criar oficina com o primeiro administrador ---------------------------------
  if (corpo.acao === 'criar') {
    const nome = (corpo.nome ?? '').trim()
    const adminNome = (corpo.admin_nome ?? '').trim()
    const adminEmail = (corpo.admin_email ?? '').trim().toLowerCase()
    const adminSenha = corpo.admin_senha ?? ''

    if (nome.length < 2) return responder({ erro: 'Informe o nome da oficina.' }, 400)
    if (adminNome.length < 2) return responder({ erro: 'Informe o nome do responsável.' }, 400)
    if (!adminEmail.includes('@')) return responder({ erro: 'Informe um e-mail válido.' }, 400)
    if (adminSenha.length < 8) {
      return responder({ erro: 'A senha precisa de pelo menos 8 caracteres.' }, 400)
    }
    if (corpo.plano && !PLANOS.includes(corpo.plano)) {
      return responder({ erro: 'Plano desconhecido.' }, 400)
    }

    const plano = corpo.plano ?? 'gratuito'

    // O prazo de teste vem da tabela de planos, não de um número escrito aqui.
    // Assim "Teste 7 Dias" é uma coisa só: o que a tela promete e o que o banco
    // cobra saem da mesma linha, e mudar de 7 para 10 é um UPDATE.
    const { data: dadosDoPlano } = await servico
      .from('planos').select('dias_de_teste').eq('id', plano).maybeSingle()

    let acessoAte: string | null = null
    if (dadosDoPlano?.dias_de_teste) {
      const fim = new Date()
      fim.setDate(fim.getDate() + Number(dadosDoPlano.dias_de_teste))
      acessoAte = fim.toISOString().slice(0, 10)
    }

    const { data: oficina, error: erroOficina } = await servico
      .from('oficinas')
      .insert({ nome, plano, acesso_ate: acessoAte, teste_ate: acessoAte })
      .select()
      .single()
    if (erroOficina) return responder({ erro: erroOficina.message }, 500)

    const { data: conta, error: erroConta } = await servico.auth.admin.createUser({
      email: adminEmail,
      password: adminSenha,
      email_confirm: true,
    })
    if (erroConta || !conta.user) {
      // Sem a conta, a oficina ficaria órfã e sem ninguém para entrar nela.
      await servico.from('oficinas').delete().eq('id', oficina.id)
      return responder({ erro: erroConta?.message ?? 'Não foi possível criar o acesso.' }, 400)
    }

    const { error: erroVinculo } = await servico.from('usuarios').insert({
      id: conta.user.id,
      oficina_id: oficina.id,
      nome: adminNome,
      email: adminEmail,
      perfil: 'admin',
      ativo: true,
    })
    if (erroVinculo) {
      // Mesma razão: desfaz os dois para não deixar meia oficina no banco.
      await servico.auth.admin.deleteUser(conta.user.id)
      await servico.from('oficinas').delete().eq('id', oficina.id)
      return responder({ erro: erroVinculo.message }, 500)
    }

    return responder({ oficina_id: oficina.id, acesso_ate: acessoAte })
  }

  // Trocar o plano --------------------------------------------------------------
  if (corpo.acao === 'plano') {
    if (!corpo.oficina_id) return responder({ erro: 'Informe a oficina.' }, 400)
    if (!corpo.plano || !PLANOS.includes(corpo.plano)) {
      return responder({ erro: 'Plano desconhecido.' }, 400)
    }
    const { error } = await servico
      .from('oficinas')
      .update({ plano: corpo.plano })
      .eq('id', corpo.oficina_id)
    if (error) return responder({ erro: error.message }, 500)
    return responder({ ok: true })
  }

  // Suspender, reativar, encerrar ------------------------------------------------
  if (corpo.acao === 'situacao') {
    if (!corpo.oficina_id) return responder({ erro: 'Informe a oficina.' }, 400)
    if (!corpo.situacao || !SITUACOES.includes(corpo.situacao)) {
      return responder({ erro: 'Situação desconhecida.' }, 400)
    }
    const { error } = await servico
      .from('oficinas')
      .update({ status: corpo.situacao })
      .eq('id', corpo.oficina_id)
    if (error) return responder({ erro: error.message }, 500)
    return responder({ ok: true })
  }

  return responder({ erro: 'Ação desconhecida.' }, 400)
})
