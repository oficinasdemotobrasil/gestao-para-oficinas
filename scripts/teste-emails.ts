/**
 * Manda os cinco e-mails para você conferir com os próprios olhos.
 *
 * Não existe teste automático que diga se um e-mail está bom. Dá para provar
 * que a função respondeu 200; não dá para provar que o texto faz sentido para
 * um dono de oficina às sete da manhã. Então este script existe para uma coisa
 * só: colocar os cinco na sua caixa de entrada.
 *
 * Enquanto não há domínio verificado, o provedor só entrega para o e-mail da
 * conta. É por isso que o destino é fixo aqui.
 *
 *   npm run teste:emails
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
config({ path: path.join(raiz, '.env.test.local'), quiet: true })
config({ path: path.join(raiz, '.env.local'), quiet: true })

const URL = process.env.SUPABASE_URL
const SERVICO = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !SERVICO) {
  console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.test.local.')
  process.exit(1)
}

/** Sem domínio verificado, o provedor só entrega para o dono da conta. */
const DESTINO = process.argv[2] ?? 'oficinasdemotobrasil@gmail.com'

const admin = createClient(URL, SERVICO, { auth: { persistSession: false } })

let passou = 0
let falhou = 0
const ok = (n: string, d = '') => { passou++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? ` (${d})` : ''}`) }
const erro = (n: string, d: string) => { falhou++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`) }

const emDias = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('pt-BR')
}

const CASOS = [
  { tipo: 'boas_vindas', dados: {} },
  { tipo: 'teste_terminando', dados: { dias_restantes: 3, acesso_ate: emDias(3) } },
  { tipo: 'teste_terminando', dados: { dias_restantes: 1, acesso_ate: emDias(1) }, rotulo: 'último dia' },
  { tipo: 'pagamento_confirmado', dados: { valor: 89.9, proxima_cobranca: emDias(30) } },
  { tipo: 'pagamento_atrasado', dados: { dias_de_carencia: 7 } },
  { tipo: 'conta_bloqueada', dados: {} },
] as const

async function main() {
  console.log('\n\x1b[1mOs e-mails do sistema\x1b[0m')
  console.log(`  para: ${DESTINO}`)

  const { data: oficina, error } = await admin
    .from('oficinas').select('id, nome').order('criado_em').limit(1).maybeSingle()
  if (error || !oficina) {
    erro('oficina', error?.message ?? 'nenhuma oficina no banco')
    process.exit(1)
  }
  console.log(`  como: ${oficina.nome}\n`)

  for (const caso of CASOS) {
    const resposta = await fetch(`${URL}/functions/v1/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICO}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: caso.tipo,
        oficina_id: oficina.id,
        para: DESTINO,
        dados: caso.dados,
      }),
    })
    const corpo = await resposta.json().catch(() => ({}))
    const nome = 'rotulo' in caso ? `${caso.tipo} (${caso.rotulo})` : caso.tipo
    resposta.ok && corpo.ok
      ? ok(nome, corpo.assunto)
      : erro(nome, corpo.erro ?? `HTTP ${resposta.status}`)
  }

  // A porta fechada: sem a chave de serviço, ninguém manda e-mail em nome do
  // sistema. Vale medir, porque um endpoint de e-mail aberto vira máquina de
  // spam com o SEU domínio na assinatura.
  const semChave = await fetch(`${URL}/functions/v1/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY ?? 'nada'}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tipo: 'boas_vindas', oficina_id: oficina.id, para: DESTINO }),
  })
  semChave.status === 401
    ? ok('com a chave do navegador, a função recusa', 'ninguém manda e-mail em nome do sistema')
    : erro('porta aberta', `respondeu ${semChave.status} para a chave publicável`)

  // E o registro, que é o que responde ao "não recebi".
  const { data: registro } = await admin
    .from('emails_enviados')
    .select('tipo, destinatario, enviado, erro')
    .eq('oficina_id', oficina.id)
    .order('criado_em', { ascending: false })
    .limit(CASOS.length)
  registro?.length === CASOS.length && registro.every((r) => r.enviado)
    ? ok(`os ${registro.length} envios ficaram registrados`)
    : erro('registro', JSON.stringify(registro))

  console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
  console.log('\nAbra a caixa de entrada e confira os seis: texto, botão e se o link abre o app.')
  process.exit(falhou > 0 ? 1 : 0)
}

void main()
