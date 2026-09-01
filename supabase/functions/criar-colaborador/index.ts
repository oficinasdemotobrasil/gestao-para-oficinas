/**
 * Cria um colaborador da oficina.
 *
 * Por que isto não é uma tela do app: criar usuário no Supabase Auth exige a
 * service_role, que ignora o RLS. Se ela estivesse no navegador, qualquer pessoa
 * logada poderia ler e escrever os dados de TODAS as oficinas. Então a chave
 * fica aqui, no servidor, e esta função é a única porta.
 *
 * A função confere, com o token de quem chamou, se ele é admin ativo, e cria o
 * colaborador sempre na oficina DELE — o oficina_id nunca vem do corpo da
 * requisição, justamente para não ser escolhido por quem chama.
 *
 * Deploy:
 *   npx supabase functions deploy criar-colaborador
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cabecalhosCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PERFIS = ['admin', 'vendedor', 'mecanico'] as const
type Perfil = (typeof PERFIS)[number]

interface Corpo {
  nome?: string
  email?: string
  senha?: string
  telefone?: string | null
  perfil?: Perfil
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

  // Cliente com o token de quem chamou: serve para descobrir QUEM é, respeitando
  // o RLS como qualquer outra consulta do app.
  const comoUsuario = createClient(url, chaveAnon, {
    global: { headers: { Authorization: autorizacao } },
  })

  const { data: sessao, error: erroSessao } = await comoUsuario.auth.getUser()
  if (erroSessao || !sessao.user) {
    return responder({ erro: 'Sua sessão expirou. Entre de novo.' }, 401)
  }

  const { data: solicitante } = await comoUsuario
    .from('usuarios')
    .select('oficina_id, perfil, ativo')
    .eq('id', sessao.user.id)
    .maybeSingle()

  if (!solicitante || !solicitante.ativo || solicitante.perfil !== 'admin') {
    return responder({ erro: 'Apenas o administrador da oficina pode cadastrar colaboradores.' }, 403)
  }

  let corpo: Corpo
  try {
    corpo = await req.json()
  } catch {
    return responder({ erro: 'Dados inválidos.' }, 400)
  }

  const nome = (corpo.nome ?? '').trim()
  const email = (corpo.email ?? '').trim().toLowerCase()
  const senha = corpo.senha ?? ''
  const telefone = corpo.telefone?.trim() || null
  const perfil = corpo.perfil

  if (nome.length < 2) return responder({ erro: 'Informe o nome do colaborador.' }, 400)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return responder({ erro: 'E-mail inválido.' }, 400)
  if (senha.length < 8) return responder({ erro: 'A senha precisa ter pelo menos 8 caracteres.' }, 400)
  if (!perfil || !PERFIS.includes(perfil)) return responder({ erro: 'Perfil inválido.' }, 400)

  // Cliente administrativo: só a partir daqui, e só no servidor.
  const comoServico = createClient(url, chaveServico, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: criado, error: erroCriacao } = await comoServico.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  })

  if (erroCriacao || !criado.user) {
    const mensagem = erroCriacao?.message ?? ''
    if (mensagem.toLowerCase().includes('already been registered')) {
      return responder({ erro: 'Já existe um acesso com este e-mail.' }, 409)
    }
    return responder({ erro: 'Não foi possível criar o acesso. Tente de novo.' }, 500)
  }

  const { error: erroVinculo } = await comoServico.from('usuarios').insert({
    id: criado.user.id,
    // A oficina vem de quem chamou, nunca do corpo da requisição.
    oficina_id: solicitante.oficina_id,
    nome,
    email,
    telefone,
    perfil,
    ativo: true,
  })

  if (erroVinculo) {
    // Sem o vínculo, o usuário do Auth ficaria órfão: entraria no app e cairia
    // na tela de acesso pendente para sempre. Desfazemos a criação.
    await comoServico.auth.admin.deleteUser(criado.user.id)
    const duplicado = erroVinculo.code === '23505'
    return responder(
      {
        erro: duplicado
          ? 'Já existe um colaborador com este e-mail.'
          : 'Não foi possível vincular o colaborador à oficina.',
      },
      duplicado ? 409 : 500,
    )
  }

  return responder({ id: criado.user.id, nome, email, perfil }, 201)
})
