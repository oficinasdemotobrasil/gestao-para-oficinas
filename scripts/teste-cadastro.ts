/**
 * O cadastro pela internet, contra o Supabase de verdade.
 *
 * A porta é a única do sistema aberta a quem não tem login, então o que este
 * teste mais mede é o que ela RECUSA. Em especial o aceite dos termos: a caixa
 * marcada no navegador é sugestão, não prova — quem chama a função por fora
 * passaria sem ela se a conferência estivesse só na tela.
 *
 * E mede a atomicidade: criar uma oficina são três escritas em lugares
 * diferentes, e meia oficina no banco é pior do que nenhuma.
 *
 *   npm run teste:cadastro
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { limparOficina } from './limpar-teste'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
config({ path: path.join(raiz, '.env.test.local'), quiet: true })
config({ path: path.join(raiz, '.env.local'), quiet: true })

const URL = process.env.SUPABASE_URL
const SERVICO = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.VITE_SUPABASE_ANON_KEY
if (!URL || !SERVICO || !ANON) {
  console.error('Faltam as chaves em .env.test.local e .env.local.')
  process.exit(1)
}

const admin = createClient(URL, SERVICO, { auth: { persistSession: false } })
const ENDERECO = `${URL}/functions/v1/cadastro`

let passou = 0
let falhou = 0
const ok = (n: string, d = '') => { passou++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? ` (${d})` : ''}`) }
const erro = (n: string, d: string) => { falhou++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`) }

const MARCA = Date.now()
const EMAIL = `cadastro.teste.${MARCA}@example.com`
const VERSAO = '2026-09-10'

async function chamar(corpo: Record<string, unknown>) {
  const r = await fetch(ENDERECO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON! },
    body: JSON.stringify(corpo),
  })
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as Record<string, unknown> }
}

const validos = {
  acao: 'criar',
  oficina: 'Oficina do Cadastro',
  responsavel: 'Dona do Cadastro',
  email: EMAIL,
  telefone: '(81) 98888-7777',
  senha: 'umaSenhaBoa123',
  aceitou_os_termos: true,
  termos_versao: VERSAO,
}

async function main() {
  console.log('\n\x1b[1mO cadastro pela internet\x1b[0m')

  const situacao = await chamar({ acao: 'situacao' })
  const estavaAberto = situacao.corpo.aberto === true
  console.log(`  cadastro ${estavaAberto ? 'ABERTO' : 'fechado'} no Secret\n`)

  let oficinaId = ''
  let contaId = ''

  try {
    if (!estavaAberto) {
      const tentativa = await chamar(validos)
      tentativa.status === 403 && tentativa.corpo.fechado === true
        ? ok('com o cadastro fechado, a função recusa', String(tentativa.corpo.erro).slice(0, 50))
        : erro('porta fechada', JSON.stringify(tentativa))
      console.log(
        '\n  Para medir o resto, ligue o Secret CADASTRO_ABERTO=sim e rode de novo.',
      )
      console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
      process.exit(falhou > 0 ? 1 : 0)
    }

    // O que a porta recusa ------------------------------------------------------
    const semAceite = await chamar({ ...validos, aceitou_os_termos: false })
    String(semAceite.corpo.erro).includes('Termos')
      ? ok('sem aceitar os termos, não cria', 'a caixa do navegador é sugestão, não prova')
      : erro('aceite', JSON.stringify(semAceite.corpo))

    const semVersao = await chamar({ ...validos, termos_versao: undefined })
    String(semVersao.corpo.erro).includes('Termos')
      ? ok('e sem dizer qual versão aceitou, também não')
      : erro('versão dos termos', JSON.stringify(semVersao.corpo))

    for (const [campo, valor, esperado] of [
      ['oficina', 'x', 'nome da oficina'],
      ['responsavel', '', 'seu nome'],
      ['email', 'nao-e-email', 'e-mail'],
      ['telefone', '123', 'telefone'],
      ['senha', 'curta', '8 caracteres'],
    ] as const) {
      const r = await chamar({ ...validos, [campo]: valor })
      String(r.corpo.erro).toLowerCase().includes(esperado.toLowerCase())
        ? ok(`${campo} inválido é recusado`, String(r.corpo.erro))
        : erro(`validação de ${campo}`, JSON.stringify(r.corpo))
    }

    // O caminho feliz -----------------------------------------------------------
    const criou = await chamar(validos)
    criou.corpo.ok === true
      ? ok('a oficina é criada', `acesso até ${criou.corpo.acesso_ate}`)
      : erro('cadastro', JSON.stringify(criou.corpo))
    oficinaId = String(criou.corpo.oficina_id ?? '')

    const { data: oficina } = await admin
      .from('oficinas')
      .select('nome, plano, acesso_ate, teste_ate, termos_aceitos_em, termos_versao')
      .eq('id', oficinaId).maybeSingle()

    oficina?.termos_aceitos_em && oficina.termos_versao === VERSAO
      ? ok('o aceite fica gravado com data E versão', oficina.termos_versao)
      : erro('aceite gravado', JSON.stringify(oficina))

    oficina?.acesso_ate && oficina.acesso_ate === oficina.teste_ate
      ? ok('e o prazo de teste vem da tabela de planos', String(oficina.acesso_ate))
      : erro('prazo de teste', JSON.stringify(oficina))

    const { data: equipe } = await admin
      .from('usuarios').select('id, nome, perfil, ativo').eq('oficina_id', oficinaId)
    if (equipe?.length === 1 && equipe[0].perfil === 'admin') {
      contaId = equipe[0].id
      ok('com o responsável como admin', equipe[0].nome)
    } else {
      erro('responsável', JSON.stringify(equipe))
    }

    // Não dá para entrar sem confirmar o e-mail ---------------------------------
    const app = createClient(URL!, ANON!, { auth: { persistSession: false } })
    const { error: eLogin } = await app.auth.signInWithPassword({
      email: EMAIL, password: validos.senha,
    })
    eLogin
      ? ok('e ninguém entra antes de confirmar o e-mail', eLogin.message.slice(0, 42))
      : erro('confirmação de e-mail', 'entrou sem confirmar')

    // E-mail repetido -----------------------------------------------------------
    const repetido = await chamar({ ...validos, oficina: 'Outra Oficina' })
    String(repetido.corpo.erro).includes('Já existe')
      ? ok('o mesmo e-mail não cria duas oficinas', String(repetido.corpo.erro).slice(0, 45))
      : erro('e-mail repetido', JSON.stringify(repetido.corpo))

    const { count } = await admin
      .from('oficinas').select('*', { count: 'exact', head: true }).eq('nome', 'Outra Oficina')
    count === 0
      ? ok('e não deixa oficina órfã para trás quando recusa')
      : erro('oficina órfã', `${count} sobraram`)
  } catch (e) {
    erro('execução', (e as Error).message)
  } finally {
    if (oficinaId) {
      await admin.from('emails_enviados').delete().eq('oficina_id', oficinaId)
      await limparOficina(admin, oficinaId)
      await admin.from('oficinas').delete().eq('id', oficinaId)
    }
    if (contaId) await admin.auth.admin.deleteUser(contaId)
    const { data: sobrou } = await admin
      .from('oficinas').select('nome').in('nome', ['Oficina do Cadastro', 'Outra Oficina'])
    sobrou?.length === 0
      ? ok('limpeza: nada ficou para trás')
      : erro('limpeza', JSON.stringify(sobrou))
  }

  console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
  process.exit(falhou > 0 ? 1 : 0)
}

void main()
