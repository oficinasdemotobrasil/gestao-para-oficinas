/**
 * Teste de segurança da Edge Function criar-colaborador.
 *
 * Esta função é o único lugar do sistema onde a service_role roda — a chave que
 * ignora o RLS e enxerga todas as oficinas. Se ela tiver uma brecha, o
 * isolamento entre oficinas cai por ali, e não pelo banco. Por isso ela tem
 * teste próprio, que não chama a função: tenta furá-la.
 *
 * Monta duas oficinas fictícias, exercita as recusas e apaga tudo no fim.
 * Precisa de .env.test.local, igual ao teste de isolamento.
 *
 *   npm run teste:funcao
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
config({ path: path.join(raiz, '.env.test.local'), quiet: true })
config({ path: path.join(raiz, '.env.local'), quiet: true })

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.VITE_SUPABASE_ANON_KEY

if (!URL || !SERVICE_ROLE || !ANON) {
  console.error('\nFaltam chaves. Veja .env.local.example.\n')
  process.exit(1)
}

const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } })
const FUNCAO = `${URL}/functions/v1/criar-colaborador`
const MARCA = Date.now()
const SENHA = `Teste!${randomUUID().slice(0, 10)}`

let passou = 0
let falhou = 0
const falhas: string[] = []

const ok = (nome: string, detalhe = '') => {
  passou++
  console.log(`  \x1b[32m✓\x1b[0m ${nome}${detalhe ? ` (${detalhe})` : ''}`)
}
const erro = (nome: string, detalhe: string) => {
  falhou++
  falhas.push(`${nome} — ${detalhe}`)
  console.log(`  \x1b[31m✗\x1b[0m ${nome}\n      ${detalhe}`)
}

async function chamar(corpo: unknown, token?: string) {
  const r = await fetch(FUNCAO, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON!,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(corpo),
  })
  let corpoResposta: Record<string, unknown> = {}
  try {
    corpoResposta = await r.json()
  } catch {
    /* resposta sem corpo */
  }
  return { status: r.status, corpo: corpoResposta }
}

async function esperaStatus(nome: string, esperado: number, chamada: ReturnType<typeof chamar>) {
  const { status, corpo } = await chamada
  if (status === esperado) ok(nome, `HTTP ${status}`)
  else erro(nome, `esperava HTTP ${esperado}, veio ${status}: ${JSON.stringify(corpo)}`)
}

async function criarConta(email: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: SENHA,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`não criou ${email}: ${error?.message}`)
  return data.user.id
}

async function entrar(email: string) {
  const c = createClient(URL!, ANON!, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: SENHA })
  if (error) throw new Error(`login falhou para ${email}: ${error.message}`)
  return data.session!.access_token
}

const oficinas: string[] = []

async function main() {
  console.log('\n\x1b[1mSegurança da Edge Function criar-colaborador\x1b[0m')
  console.log(`  ${FUNCAO}`)

  try {
    console.log('\n\x1b[1mSem sessão\x1b[0m')
    await esperaStatus(
      'recusa quem não está logado',
      401,
      chamar({ nome: 'X', email: 'x@example.com', senha: 'senha12345', perfil: 'admin' }),
    )

    console.log('\n\x1b[1mMontando duas oficinas\x1b[0m')
    const { data: ofA } = await admin
      .from('oficinas')
      .insert({ nome: `[teste funcao ${MARCA}] A` })
      .select()
      .single()
    const { data: ofB } = await admin
      .from('oficinas')
      .insert({ nome: `[teste funcao ${MARCA}] B` })
      .select()
      .single()
    oficinas.push(ofA.id, ofB.id)

    const emailAdmin = `teste.funcao.${MARCA}.admin@example.com`
    const emailVendedor = `teste.funcao.${MARCA}.vendedor@example.com`
    const idAdmin = await criarConta(emailAdmin)
    const idVendedor = await criarConta(emailVendedor)

    await admin.from('usuarios').insert([
      { id: idAdmin, oficina_id: ofA.id, nome: 'Admin A', email: emailAdmin, perfil: 'admin', ativo: true },
      { id: idVendedor, oficina_id: ofA.id, nome: 'Vendedor A', email: emailVendedor, perfil: 'vendedor', ativo: true },
    ])
    ok('oficina A com admin e vendedor, oficina B como alvo')

    const tokenAdmin = await entrar(emailAdmin)
    const tokenVendedor = await entrar(emailVendedor)

    console.log('\n\x1b[1mQuem pode chamar\x1b[0m')
    await esperaStatus(
      'vendedor não cria colaborador',
      403,
      chamar(
        { nome: 'Intruso', email: `teste.funcao.${MARCA}.i1@example.com`, senha: 'senha12345', perfil: 'admin' },
        tokenVendedor,
      ),
    )

    console.log('\n\x1b[1mValidação dos dados\x1b[0m')
    await esperaStatus(
      'recusa senha com menos de 8 caracteres',
      400,
      chamar({ nome: 'Fulano', email: `teste.funcao.${MARCA}.i2@example.com`, senha: '123', perfil: 'mecanico' }, tokenAdmin),
    )
    await esperaStatus(
      'recusa perfil que não existe',
      400,
      chamar({ nome: 'Fulano', email: `teste.funcao.${MARCA}.i3@example.com`, senha: 'senha12345', perfil: 'dono' }, tokenAdmin),
    )
    await esperaStatus(
      'recusa e-mail malformado',
      400,
      chamar({ nome: 'Fulano', email: 'nao-e-email', senha: 'senha12345', perfil: 'mecanico' }, tokenAdmin),
    )

    // O teste que justifica o arquivo: quem chama não escolhe a oficina.
    console.log('\n\x1b[1mTentativa de plantar colaborador em outra oficina\x1b[0m')
    const emailAlvo = `teste.funcao.${MARCA}.alvo@example.com`
    const { status } = await chamar(
      {
        nome: 'Plantado',
        email: emailAlvo,
        senha: 'senha12345',
        perfil: 'mecanico',
        oficina_id: ofB.id, // ← a injeção
      },
      tokenAdmin,
    )

    if (status !== 201) {
      erro('criação legítima de colaborador', `esperava HTTP 201, veio ${status}`)
    } else {
      const { data: plantado } = await admin
        .from('usuarios')
        .select('oficina_id')
        .eq('email', emailAlvo)
        .maybeSingle()

      if (plantado?.oficina_id === ofA.id) {
        ok('o oficina_id do corpo é ignorado', 'colaborador nasceu na oficina de quem chamou')
      } else if (plantado?.oficina_id === ofB.id) {
        erro(
          'VAZAMENTO ENTRE OFICINAS',
          'a função obedeceu ao oficina_id do corpo e plantou um colaborador na oficina de outro cliente',
        )
      } else {
        erro('destino do colaborador', `foi parar em ${plantado?.oficina_id}`)
      }
    }

    await esperaStatus(
      'recusa e-mail já cadastrado',
      409,
      chamar({ nome: 'Plantado', email: emailAlvo, senha: 'senha12345', perfil: 'mecanico' }, tokenAdmin),
    )
  } catch (e) {
    erro('execução do teste', (e as Error).message)
  } finally {
    console.log('\n\x1b[1mLimpeza\x1b[0m')
    for (const id of oficinas) {
      await admin.from('usuarios').delete().eq('oficina_id', id)
      await admin.from('oficinas').delete().eq('id', id)
    }
    const { data: lista } = await admin.auth.admin.listUsers()
    for (const u of lista.users) {
      if (u.email?.startsWith('teste.funcao.')) await admin.auth.admin.deleteUser(u.id)
    }
    ok('oficinas e usuários de teste removidos')
  }

  console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
  if (falhas.length) {
    console.log('\nFalhas:')
    falhas.forEach((f) => console.log(`  - ${f}`))
  }
  process.exit(falhou === 0 ? 0 : 1)
}

void main()
