/**
 * Os e-mails do sistema.
 *
 * Quem chama: só o servidor — o webhook da cobrança e a rotina diária de
 * avisos. A porta é fechada comparando o token da requisição com a
 * service_role: não existe caminho a partir do navegador.
 *
 * Confirmação de cadastro e recuperação de senha NÃO estão aqui de propósito:
 * elas são do Supabase Auth, e o caminho certo é plugar o provedor como SMTP
 * personalizado dele. Reescrever o que o Auth já faz seria duplicar um fluxo
 * de segurança para ganhar nada.
 *
 * Todo envio vira linha em `emails_enviados`, com o resultado. E-mail é a
 * única parte do sistema que falha em silêncio; sem registro, "não recebi"
 * não tem resposta.
 *
 * Deploy:
 *   npx supabase functions deploy emails
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cabecalhosCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const AMARELO = '#f5c518'
const ESCURO = '#111113'
const CINZA = '#6b6b70'

type Tipo =
  | 'boas_vindas'
  | 'teste_terminando'
  | 'pagamento_confirmado'
  | 'pagamento_atrasado'
  | 'conta_bloqueada'

interface Corpo {
  tipo?: Tipo
  oficina_id?: string
  /** Sobrescreve o destinatário. Usado só para conferir os modelos. */
  para?: string
  dados?: Record<string, string | number>
  /**
   * O que este envio cobre, para não repetir. Nos avisos de fim de teste é
   * "vencimento|marco": enquanto ele não sair com sucesso, a rotina do dia
   * seguinte tenta de novo.
   */
  referencia?: string
}

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cabecalhosCors, 'Content-Type': 'application/json' },
  })
}

const moeda = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`

/** Escapa o que vem de fora antes de virar HTML. */
function seguro(texto: string | number | undefined): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * A moldura de todo e-mail.
 *
 * Tabela e estilo em linha, e não flexbox com folha de estilo, porque cliente
 * de e-mail não é navegador: o Outlook ainda renderiza com o motor do Word.
 * O que é feio aqui é o que chega inteiro lá.
 */
function moldura(titulo: string, corpo: string, botao?: { texto: string; url: string }): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${seguro(titulo)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;">
  <tr><td style="height:6px;background:${AMARELO};font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="padding:28px 28px 8px 28px;">
    <p style="margin:0;font-size:13px;color:${CINZA};">Gestão para Oficinas</p>
    <h1 style="margin:6px 0 0 0;font-size:22px;line-height:28px;color:${ESCURO};">${seguro(titulo)}</h1>
  </td></tr>
  <tr><td style="padding:8px 28px 24px 28px;font-size:15px;line-height:23px;color:${ESCURO};">
    ${corpo}
  </td></tr>
  ${
    botao
      ? `<tr><td style="padding:0 28px 28px 28px;">
    <a href="${seguro(botao.url)}" style="display:inline-block;background:${AMARELO};color:${ESCURO};text-decoration:none;font-weight:600;font-size:15px;padding:13px 24px;border-radius:12px;">${seguro(botao.texto)}</a>
  </td></tr>`
      : ''
  }
  <tr><td style="padding:0 28px 26px 28px;border-top:1px solid #e6e6e9;">
    <p style="margin:16px 0 0 0;font-size:12px;line-height:18px;color:${CINZA};">
      Este é um aviso automático do sistema da sua oficina.
      Se precisar de ajuda, é só responder esta mensagem.
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
}

function montar(
  tipo: Tipo,
  dadosBrutos: Record<string, string | number>,
  appUrl: string,
): { assunto: string; html: string } {
  const d = dadosBrutos
  const oficina = seguro(d.oficina)
  const nome = seguro(d.nome)

  switch (tipo) {
    case 'boas_vindas':
      return {
        assunto: `Bem-vindo, ${d.nome}! Sua oficina já está no ar`,
        html: moldura(
          `Sua oficina já está no ar`,
          `<p style="margin:0 0 14px 0;">Olá, ${nome}.</p>
           <p style="margin:0 0 14px 0;">A <strong>${oficina}</strong> está pronta para usar. Comece pelo básico, na ordem que a oficina trabalha:</p>
           <ol style="margin:0 0 14px 0;padding-left:20px;">
             <li style="margin-bottom:6px;">Complete os dados da oficina</li>
             <li style="margin-bottom:6px;">Suba o seu logo e escolha a cor da marca</li>
             <li style="margin-bottom:6px;">Cadastre o primeiro serviço e o primeiro produto</li>
             <li>Faça o primeiro orçamento</li>
           </ol>
           <p style="margin:0;">Leva uns dez minutos, e depois disso dá para atender com o celular na mão.</p>`,
          { texto: 'Abrir minha oficina', url: appUrl },
        ),
      }

    case 'teste_terminando': {
      const n = Number(d.dias_restantes ?? 0)
      return {
        assunto:
          n <= 1
            ? `Seu teste termina amanhã`
            : `Seu teste termina em ${dias(n)}`,
        html: moldura(
          n <= 1 ? 'Seu teste termina amanhã' : `Faltam ${dias(n)} de teste`,
          `<p style="margin:0 0 14px 0;">Olá, ${nome}.</p>
           <p style="margin:0 0 14px 0;">O período de teste da <strong>${oficina}</strong> termina em <strong>${seguro(d.acesso_ate)}</strong>.</p>
           <p style="margin:0 0 14px 0;">Nada do que você cadastrou se perde. Depois do prazo, a oficina continua consultando tudo — clientes, ordens, histórico — e para de registrar coisas novas até a assinatura começar.</p>
           <p style="margin:0;">Se quiser continuar, é só escolher um plano.</p>`,
          { texto: 'Escolher meu plano', url: `${appUrl}/configuracoes` },
        ),
      }
    }

    case 'pagamento_confirmado':
      return {
        assunto: `Pagamento confirmado — ${oficina}`,
        html: moldura(
          'Pagamento confirmado',
          `<p style="margin:0 0 14px 0;">Olá, ${nome}.</p>
           <p style="margin:0 0 14px 0;">Recebemos o pagamento de <strong>${seguro(moeda(Number(d.valor ?? 0)))}</strong> da <strong>${oficina}</strong>. Está tudo em dia.</p>
           <p style="margin:0;">Próxima cobrança em <strong>${seguro(d.proxima_cobranca)}</strong>.</p>`,
          { texto: 'Ver minha assinatura', url: `${appUrl}/configuracoes` },
        ),
      }

    case 'pagamento_atrasado': {
      const n = Number(d.dias_de_carencia ?? 7)
      return {
        assunto: `Pagamento em atraso — ${oficina}`,
        html: moldura(
          'Seu pagamento está em atraso',
          `<p style="margin:0 0 14px 0;">Olá, ${nome}.</p>
           <p style="margin:0 0 14px 0;">O pagamento da <strong>${oficina}</strong> venceu e ainda não foi identificado.</p>
           <p style="margin:0 0 14px 0;"><strong>Você continua trabalhando normalmente.</strong> Tem ${dias(n)} para regularizar sem nenhuma mudança no sistema.</p>
           <p style="margin:0;">Se já pagou, pode ignorar este aviso — a confirmação às vezes leva um dia útil.</p>`,
          { texto: 'Regularizar', url: `${appUrl}/configuracoes` },
        ),
      }
    }

    case 'conta_bloqueada':
      return {
        assunto: `Acesso bloqueado — ${oficina}`,
        html: moldura(
          'Acesso bloqueado',
          `<p style="margin:0 0 14px 0;">Olá, ${nome}.</p>
           <p style="margin:0 0 14px 0;">O prazo de regularização da <strong>${oficina}</strong> terminou, e o registro de coisas novas está bloqueado.</p>
           <p style="margin:0 0 14px 0;"><strong>Nada foi apagado.</strong> Você continua consultando clientes, motos, ordens e histórico, e pode baixar todos os seus dados em planilha a qualquer momento.</p>
           <p style="margin:0;">Assim que o pagamento for identificado, tudo volta no mesmo lugar.</p>`,
          { texto: 'Regularizar', url: `${appUrl}/configuracoes` },
        ),
      }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cabecalhosCors })
  if (req.method !== 'POST') return responder({ erro: 'Método não permitido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const chaveServico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const chaveResend = Deno.env.get('RESEND_API_KEY')
  const remetente = Deno.env.get('EMAIL_REMETENTE')
  const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '')

  if (!chaveResend || !remetente) {
    return responder({ erro: 'Faltam RESEND_API_KEY e EMAIL_REMETENTE nos Secrets.' }, 500)
  }

  // Porta fechada: só quem tem a service_role entra. Não existe caminho a
  // partir do navegador, e é por isso que esta função nunca é chamada pelo app.
  const autorizacao = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (autorizacao !== chaveServico) {
    return responder({ erro: 'Não autorizado.' }, 401)
  }

  let corpo: Corpo
  try {
    corpo = await req.json()
  } catch {
    return responder({ erro: 'Requisição inválida.' }, 400)
  }

  const tipos: Tipo[] = [
    'boas_vindas', 'teste_terminando', 'pagamento_confirmado',
    'pagamento_atrasado', 'conta_bloqueada',
  ]
  if (!corpo.tipo || !tipos.includes(corpo.tipo)) {
    return responder({ erro: 'Tipo de e-mail desconhecido.' }, 400)
  }
  if (!corpo.oficina_id) return responder({ erro: 'Falta a oficina.' }, 400)

  const servico = createClient(url, chaveServico, { auth: { persistSession: false } })

  // O destinatário vem do banco, não do pedido: assim ninguém manda e-mail em
  // nome do sistema para um endereço qualquer. `para` só sobrescreve para
  // conferência de modelo, e só o servidor consegue chamar isto.
  const { data: oficina } = await servico
    .from('oficinas').select('nome').eq('id', corpo.oficina_id).maybeSingle()
  const { data: dono } = await servico
    .from('usuarios').select('nome, email')
    .eq('oficina_id', corpo.oficina_id).eq('perfil', 'admin').eq('ativo', true)
    .order('criado_em', { ascending: true })
    .limit(1).maybeSingle()

  if (!oficina) return responder({ erro: 'Oficina não encontrada.' }, 404)
  const destinatario = corpo.para ?? dono?.email
  if (!destinatario) return responder({ erro: 'A oficina não tem responsável com e-mail.' }, 400)

  const { assunto, html } = montar(
    corpo.tipo,
    { oficina: oficina.nome, nome: dono?.nome ?? 'você', ...(corpo.dados ?? {}) },
    appUrl,
  )

  let enviado = false
  let idExterno: string | null = null
  let mensagemDeErro: string | null = null

  try {
    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${chaveResend}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: remetente,
        to: [destinatario],
        subject: assunto,
        html,
        // Quem responder um "não responda" precisa chegar em alguém.
        reply_to: Deno.env.get('EMAIL_RESPOSTA') ?? undefined,
      }),
    })
    const resultado = await resposta.json().catch(() => ({}))
    if (resposta.ok) {
      enviado = true
      idExterno = resultado?.id ?? null
    } else {
      mensagemDeErro = resultado?.message ?? `HTTP ${resposta.status}`
    }
  } catch (e) {
    mensagemDeErro = (e as Error).message
  }

  await servico.from('emails_enviados').insert({
    oficina_id: corpo.oficina_id,
    tipo: corpo.tipo,
    destinatario,
    assunto,
    enviado,
    id_externo: idExterno,
    erro: mensagemDeErro,
    referencia: corpo.referencia ?? null,
  })

  return enviado
    ? responder({ ok: true, id: idExterno, destinatario, assunto })
    : responder({ erro: mensagemDeErro ?? 'Falha no envio.', destinatario }, 502)
})
