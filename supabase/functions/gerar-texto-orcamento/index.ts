/**
 * Gera um texto comercial para o campo Observações do orçamento, usando o
 * Gemini. Uso opcional do admin ou vendedor — nunca automático.
 *
 * Por que é uma Edge Function e não uma chamada direta do navegador: a chave do
 * Gemini é paga por uso. No navegador, qualquer pessoa que abrisse o DevTools
 * a copiaria e gastaria a cota da oficina. Aqui ela fica só no servidor, e a
 * função confere sessão e perfil antes de gastar um único token.
 *
 * Segredos exigidos (Supabase → Edge Functions → Secrets):
 *   GEMINI_API_KEY  — obrigatório
 *   GEMINI_MODEL    — obrigatório. Verifique em ai.google.dev/pricing qual é o
 *                      modelo mais barato hoje; não existe um valor certo para
 *                      sempre. Em fev/2025 isso era algo como
 *                      "gemini-2.0-flash-lite" — pode já ter mudado.
 *
 * Deploy:
 *   npx supabase functions deploy gerar-texto-orcamento
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cabecalhosCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ItemEntrada {
  descricao?: string
  tipo?: string
  quantidade?: number
  valor_unitario?: number
}

interface Corpo {
  itens?: ItemEntrada[]
  desconto?: number
  total?: number
}

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cabecalhosCors, 'Content-Type': 'application/json' },
  })
}

function formatarReais(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

/**
 * Regras do texto: persuasivo com o que é verdade, nunca enganoso. Nada de
 * urgência falsa ("só hoje", "última vaga") nem de exagerar risco que o item
 * não sustenta — isso rende reclamação, não aprovação.
 */
function montarPrompt(oficina: string, itens: ItemEntrada[], desconto: number, total: number): string {
  const linhasItens = itens
    .map((i) => {
      const qtd = i.quantidade ?? 1
      const valor = i.valor_unitario ?? 0
      return `- ${i.descricao ?? 'Item'} (${qtd}x, ${formatarReais(valor)} cada)`
    })
    .join('\n')

  return [
    `Oficina: ${oficina}`,
    `Itens do orçamento:`,
    linhasItens,
    desconto > 0 ? `Desconto aplicado: ${formatarReais(desconto)}` : null,
    `Valor total: ${formatarReais(total)}`,
  ]
    .filter(Boolean)
    .join('\n')
}

const INSTRUCAO_DO_SISTEMA = `
Você escreve o texto de observações de um orçamento de oficina de moto
brasileira, para o campo que o cliente vai ler (inclusive por WhatsApp).

Regras, sem exceção:
- Português do Brasil, tom direto e persuasivo, mas sempre honesto.
- Baseie-se só nos itens e valores informados. Nunca invente desconto, prazo,
  garantia ou defeito que não foi dito.
- Nada de urgência falsa ("só hoje", "última vaga", contagem regressiva).
- Pode mencionar segurança quando o item já sugere isso (freio, pneu,
  suspensão), mas sem exagerar ou afirmar risco iminente sem base.
- 2 a 4 parágrafos curtos, prontos para colar numa mensagem. Sem saudação tipo
  "Olá", sem assinatura, sem emoji em excesso (no máximo um ou dois).
- Termine convidando a pessoa a aprovar o orçamento.
- Devolva só o texto final, nada de explicação sobre o que você fez.
`.trim()

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cabecalhosCors })
  if (req.method !== 'POST') return responder({ erro: 'Método não permitido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const chaveAnon = Deno.env.get('SUPABASE_ANON_KEY')!
  const chaveGemini = Deno.env.get('GEMINI_API_KEY')
  const modeloGemini = Deno.env.get('GEMINI_MODEL')

  const autorizacao = req.headers.get('Authorization') ?? ''
  if (!autorizacao) return responder({ erro: 'Faça login novamente.' }, 401)

  // Mesma sessão do usuário: o RLS decide o que ele enxerga, igual a qualquer
  // outra chamada do app.
  const comoUsuario = createClient(url, chaveAnon, {
    global: { headers: { Authorization: autorizacao } },
  })

  const { data: sessao, error: erroSessao } = await comoUsuario.auth.getUser()
  if (erroSessao || !sessao.user) {
    return responder({ erro: 'Sua sessão expirou. Entre de novo.' }, 401)
  }

  const { data: solicitante } = await comoUsuario
    .from('usuarios')
    .select('perfil, ativo, oficina_id')
    .eq('id', sessao.user.id)
    .maybeSingle()

  // Mesmo recorte de quem edita orçamento: admin e vendedor. O mecânico não
  // mexe em orçamento, então também não gera texto de venda.
  if (!solicitante || !solicitante.ativo || !['admin', 'vendedor'].includes(solicitante.perfil)) {
    return responder({ erro: 'Seu perfil não permite gerar este texto.' }, 403)
  }

  let corpo: Corpo
  try {
    corpo = await req.json()
  } catch {
    return responder({ erro: 'Dados inválidos.' }, 400)
  }

  const itens = (corpo.itens ?? []).filter((i) => (i.descricao ?? '').trim().length > 0)
  if (itens.length === 0) {
    return responder({ erro: 'Adicione pelo menos um item ao orçamento antes de gerar o texto.' }, 400)
  }
  const total = typeof corpo.total === 'number' ? corpo.total : 0
  const desconto = typeof corpo.desconto === 'number' ? corpo.desconto : 0

  if (!chaveGemini || !modeloGemini) {
    console.error('GEMINI_API_KEY ou GEMINI_MODEL não configurados.')
    return responder(
      { erro: 'A geração por IA ainda não foi configurada nesta oficina. Fale com o suporte.' },
      500,
    )
  }

  // O nome da oficina vem do banco, pela sessão do usuário — nunca do corpo da
  // requisição. Assim ninguém personaliza o texto com o nome de outra oficina.
  const { data: oficina } = await comoUsuario
    .from('oficinas')
    .select('nome')
    .eq('id', solicitante.oficina_id)
    .maybeSingle()

  const prompt = montarPrompt(oficina?.nome ?? 'a oficina', itens, desconto, total)

  try {
    const resposta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modeloGemini}:generateContent?key=${chaveGemini}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: INSTRUCAO_DO_SISTEMA }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 500 },
        }),
      },
    )

    if (!resposta.ok) {
      const detalhe = await resposta.text()
      console.error('Gemini respondeu com erro:', resposta.status, detalhe)
      return responder({ erro: 'Não foi possível gerar o texto agora. Tente de novo em instantes.' }, 502)
    }

    const json = await resposta.json()
    const texto: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!texto) {
      // Acontece quando o filtro de segurança do Gemini bloqueia a resposta.
      console.error('Gemini não devolveu texto:', JSON.stringify(json).slice(0, 500))
      return responder({ erro: 'Não foi possível gerar o texto para este orçamento. Tente de novo ou escreva manualmente.' }, 502)
    }

    return responder({ texto: texto.trim() })
  } catch (e) {
    console.error('Falha ao chamar o Gemini:', e)
    return responder({ erro: 'Sem conexão com o serviço de IA. Verifique a internet e tente de novo.' }, 502)
  }
})
