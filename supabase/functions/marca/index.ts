/**
 * O logo da oficina: gravar e remover.
 *
 * Por que isto não é um envio direto do navegador para o Storage:
 *
 * 1. A validação de tipo e de tamanho existia só no navegador, e navegador não
 *    é lugar de garantir regra — quem chama a API direto passa por cima dela.
 *    Aqui a conferência acontece onde o cliente não alcança.
 * 2. O caminho do arquivo passa a ser escolhido pelo servidor, a partir da
 *    oficina de quem pediu. Não existe caminho vindo do cliente para conferir,
 *    porque não existe caminho vindo do cliente.
 *
 * Quem pode chamar: o admin ativo de uma oficina, e ele só alcança a dele.
 *
 * Deploy:
 *   npx supabase functions deploy marca
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cabecalhosCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BALDE = 'logos'
/** Já vem reduzido pelo navegador; o teto é folga, não permissão. */
const MAXIMO_POR_ARQUIVO = 1024 * 1024

interface Corpo {
  acao?: 'salvar' | 'remover'
  /** PNG em base64, sem o prefixo "data:". */
  grande?: string
  miniatura?: string
}

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cabecalhosCors, 'Content-Type': 'application/json' },
  })
}

/** Converte o base64 e recusa o que não for PNG de verdade. */
function paraPng(base64: string | undefined, qual: string): Uint8Array {
  if (!base64) throw new Error(`Falta a imagem (${qual}).`)
  let bytes: Uint8Array
  try {
    const bruto = atob(base64)
    bytes = new Uint8Array(bruto.length)
    for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i)
  } catch {
    throw new Error('A imagem chegou corrompida. Tente enviar de novo.')
  }
  if (bytes.length > MAXIMO_POR_ARQUIVO) throw new Error('A imagem ficou grande demais.')
  // Os oito primeiros bytes de todo PNG. Confiar na extensão ou no tipo
  // declarado é confiar em quem envia.
  const assinatura = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 8 || assinatura.some((b, i) => bytes[i] !== b)) {
    throw new Error('O arquivo não é uma imagem PNG.')
  }
  return bytes
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cabecalhosCors })
  if (req.method !== 'POST') return responder({ erro: 'Método não permitido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const chaveAnon = Deno.env.get('SUPABASE_ANON_KEY')!
  const chaveServico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const autorizacao = req.headers.get('Authorization') ?? ''
  if (!autorizacao) return responder({ erro: 'Faça login novamente.' }, 401)

  const comoUsuario = createClient(url, chaveAnon, {
    global: { headers: { Authorization: autorizacao } },
  })
  const { data: sessao, error: erroSessao } = await comoUsuario.auth.getUser()
  if (erroSessao || !sessao.user) return responder({ erro: 'Faça login novamente.' }, 401)

  // Daqui para baixo o banco permite tudo, então a permissão é destas linhas.
  const servico = createClient(url, chaveServico, { auth: { persistSession: false } })

  const { data: quem } = await servico
    .from('usuarios')
    .select('oficina_id, perfil, ativo')
    .eq('id', sessao.user.id)
    .maybeSingle()

  if (!quem || !quem.ativo || quem.perfil !== 'admin') {
    return responder({ erro: 'Seu perfil não permite esta ação.' }, 403)
  }
  const oficinaId = quem.oficina_id as string

  let corpo: Corpo
  try {
    corpo = await req.json()
  } catch {
    return responder({ erro: 'Requisição inválida.' }, 400)
  }

  const caminhoGrande = `${oficinaId}/logo.png`
  const caminhoMiniatura = `${oficinaId}/logo-miniatura.png`

  // Remover -------------------------------------------------------------------
  if (corpo.acao === 'remover') {
    await servico.storage.from(BALDE).remove([caminhoGrande, caminhoMiniatura])
    const { error } = await servico
      .from('oficinas')
      .update({ logo_url: null, logo_miniatura_url: null })
      .eq('id', oficinaId)
    if (error) return responder({ erro: error.message }, 400)
    return responder({ ok: true, logo_url: null, logo_miniatura_url: null })
  }

  // Salvar --------------------------------------------------------------------
  if (corpo.acao !== 'salvar') return responder({ erro: 'Ação desconhecida.' }, 400)

  let grande: Uint8Array
  let miniatura: Uint8Array
  try {
    grande = paraPng(corpo.grande, 'tamanho grande')
    miniatura = paraPng(corpo.miniatura, 'miniatura')
  } catch (e) {
    return responder({ erro: (e as Error).message }, 400)
  }

  for (const [caminho, conteudo] of [
    [caminhoGrande, grande],
    [caminhoMiniatura, miniatura],
  ] as const) {
    const { error } = await servico.storage
      .from(BALDE)
      .upload(caminho, conteudo, { upsert: true, contentType: 'image/png' })
    if (error) return responder({ erro: error.message }, 400)
  }

  // A versão no endereço obriga o navegador a buscar o arquivo novo. Sem ela, a
  // oficina troca o logo, vê o antigo, e jura que não salvou.
  const versao = Date.now()
  const publico = (caminho: string) =>
    `${servico.storage.from(BALDE).getPublicUrl(caminho).data.publicUrl}?v=${versao}`

  const logo_url = publico(caminhoGrande)
  const logo_miniatura_url = publico(caminhoMiniatura)

  const { error } = await servico
    .from('oficinas')
    .update({ logo_url, logo_miniatura_url })
    .eq('id', oficinaId)
  if (error) return responder({ erro: error.message }, 400)

  return responder({ ok: true, logo_url, logo_miniatura_url })
})
