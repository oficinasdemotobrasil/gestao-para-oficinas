/**
 * O cadastro pela internet: a oficina cria a própria conta.
 *
 * É a única porta do sistema aberta a quem não tem login. Por isso ela começa
 * fechada e só abre quando o Secret CADASTRO_ABERTO valer 'sim'. Enquanto a
 * cobrança não estiver ligada, cadastro aberto significa qualquer pessoa do
 * mundo criando oficina de graça para sempre — e o banco virando depósito.
 *
 * Criar uma oficina são três escritas em lugares diferentes: a conta no serviço
 * de autenticação, a linha da oficina e a linha da pessoa. Se a segunda falhar,
 * sobra uma conta órfã; se a terceira falhar, sobra uma oficina sem ninguém
 * dentro. Por isso cada passo desfaz os anteriores quando quebra.
 *
 * Deploy (sem exigir JWT: quem chama ainda não tem conta):
 *   npx supabase functions deploy cadastro --no-verify-jwt
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cabecalhosCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Corpo {
  acao?: 'situacao' | 'criar'
  oficina?: string
  responsavel?: string
  email?: string
  telefone?: string
  senha?: string
  /** A versão do documento que estava na tela quando a caixa foi marcada. */
  termos_versao?: string
  aceitou_os_termos?: boolean
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
  const chaveServico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const aberto = (Deno.env.get('CADASTRO_ABERTO') ?? '').toLowerCase() === 'sim'

  let corpo: Corpo
  try {
    corpo = await req.json()
  } catch {
    return responder({ erro: 'Requisição inválida.' }, 400)
  }

  // A tela pergunta antes de mostrar o formulário: melhor dizer que ainda não
  // abriu do que deixar a pessoa preencher tudo para tomar um não no fim.
  if (corpo.acao === 'situacao') return responder({ aberto })

  if (!aberto) {
    return responder(
      {
        erro: 'Ainda não estamos aceitando cadastros pela internet. Fale com a gente que abrimos a sua conta.',
        fechado: true,
      },
      403,
    )
  }

  const nomeDaOficina = (corpo.oficina ?? '').trim()
  const responsavel = (corpo.responsavel ?? '').trim()
  const email = (corpo.email ?? '').trim().toLowerCase()
  const telefone = (corpo.telefone ?? '').trim()
  const senha = corpo.senha ?? ''

  if (nomeDaOficina.length < 2) return responder({ erro: 'Informe o nome da oficina.', campo: 'oficina' }, 400)
  if (responsavel.length < 2) return responder({ erro: 'Informe o seu nome.', campo: 'responsavel' }, 400)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return responder({ erro: 'Informe um e-mail válido.', campo: 'email' }, 400)
  }
  if (soDigitos(telefone).length < 10) {
    return responder({ erro: 'Informe um telefone com DDD.', campo: 'telefone' }, 400)
  }
  if (senha.length < 8) {
    return responder({ erro: 'A senha precisa de pelo menos 8 caracteres.', campo: 'senha' }, 400)
  }
  // O aceite é conferido aqui, e não só na tela: uma caixa marcada no navegador
  // é sugestão, não prova. Quem chama a função por fora passaria sem ela.
  if (!corpo.aceitou_os_termos || !corpo.termos_versao) {
    return responder(
      { erro: 'É preciso aceitar os Termos de Uso e a Política de Privacidade.', campo: 'termos' },
      400,
    )
  }

  const servico = createClient(url, chaveServico, { auth: { persistSession: false } })

  // O plano de entrada e quantos dias ele dura vêm da tabela, não daqui.
  const { data: planoDeEntrada } = await servico
    .from('planos').select('id, dias_de_teste')
    .not('dias_de_teste', 'is', null)
    .order('ordem').limit(1).maybeSingle()

  let acessoAte: string | null = null
  if (planoDeEntrada?.dias_de_teste) {
    const fim = new Date()
    fim.setDate(fim.getDate() + Number(planoDeEntrada.dias_de_teste))
    acessoAte = fim.toISOString().slice(0, 10)
  }

  // 1. A conta. Sem confirmar o e-mail: quem não confirma não entra, e é isso
  //    que impede alguém de cadastrar com o endereço de outra pessoa.
  const { data: conta, error: erroConta } = await servico.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: false,
  })
  if (erroConta || !conta.user) {
    const jaExiste = /already|registered|exists/i.test(erroConta?.message ?? '')
    return responder(
      {
        erro: jaExiste
          ? 'Já existe uma conta com esse e-mail. Tente entrar, ou recupere a senha.'
          : (erroConta?.message ?? 'Não foi possível criar a conta.'),
        campo: jaExiste ? 'email' : undefined,
      },
      400,
    )
  }

  // 2. A oficina, já com o aceite dos termos e o prazo de teste.
  const { data: oficina, error: erroOficina } = await servico
    .from('oficinas')
    .insert({
      nome: nomeDaOficina,
      telefone,
      plano: planoDeEntrada?.id ?? 'gratuito',
      acesso_ate: acessoAte,
      teste_ate: acessoAte,
      termos_aceitos_em: new Date().toISOString(),
      termos_versao: corpo.termos_versao,
    })
    .select()
    .single()
  if (erroOficina || !oficina) {
    await servico.auth.admin.deleteUser(conta.user.id)
    return responder({ erro: erroOficina?.message ?? 'Não foi possível criar a oficina.' }, 500)
  }

  // 3. A pessoa dentro da oficina.
  const { error: erroVinculo } = await servico.from('usuarios').insert({
    id: conta.user.id,
    oficina_id: oficina.id,
    nome: responsavel,
    email,
    telefone,
    perfil: 'admin',
    ativo: true,
  })
  if (erroVinculo) {
    await servico.from('oficinas').delete().eq('id', oficina.id)
    await servico.auth.admin.deleteUser(conta.user.id)
    return responder({ erro: erroVinculo.message }, 500)
  }

  // O e-mail de boas-vindas é um bônus: se falhar, o cadastro continua de pé.
  // A confirmação do endereço é outra coisa, e quem manda é o serviço de
  // autenticação.
  try {
    await fetch(`${url}/functions/v1/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chaveServico}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'boas_vindas', oficina_id: oficina.id }),
    })
  } catch {
    // Registrado pela própria função de e-mails, em emails_enviados.
  }

  return responder({
    ok: true,
    oficina_id: oficina.id,
    acesso_ate: acessoAte,
    precisa_confirmar_email: true,
  })
})
