/**
 * A marca da oficina contra o Supabase de verdade.
 *
 * Este teste existe por causa de uma coisa que só apareceu ao clicar: o envio
 * do logo não passa mais direto do navegador para o Storage, e sim pela Edge
 * Function `marca`. A conferência de quem pode e do que é o arquivo mudou de
 * lugar — saiu do navegador, onde qualquer um contorna, e foi para o servidor.
 * Se essa função voltar a aceitar o que não deve, nada quebra na tela: o
 * problema só aparece no dia em que alguém subir o que não devia.
 *
 * Cria a própria oficina e a apaga no fim.
 *
 *   npm run teste:marca
 */
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
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
  console.error('Faltam SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (.env.test.local) e VITE_SUPABASE_ANON_KEY.')
  process.exit(1)
}

const admin = createClient(URL, SERVICO, { auth: { persistSession: false } })
const MARCA = Date.now()
const SENHA = `Marca!${MARCA}`

let passou = 0
let falhou = 0
const ok = (n: string, d = '') => { passou++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? ` (${d})` : ''}`) }
const erro = (n: string, d: string) => { falhou++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`) }

/**
 * Um PNG de 1×1 montado aqui, sem depender de arquivo nenhum: o teste precisa
 * rodar em qualquer máquina, inclusive numa esteira sem a pasta do projeto.
 */
const PNG_MINIMO =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** A função devolve o erro no corpo; o supabase-js embrulha o 4xx em `error`. */
type Resposta = Record<string, unknown>

async function chamar(cliente: SupabaseClient, body: Record<string, unknown>): Promise<Resposta> {
  const r = await cliente.functions.invoke('marca', { body })
  if (r.data) return r.data as Resposta
  const contexto = (r.error as { context?: { text?: () => Promise<string> } })?.context
  if (contexto?.text) {
    try {
      return JSON.parse(await contexto.text()) as Resposta
    } catch {
      /* resposta sem corpo JSON */
    }
  }
  return { erro: r.error?.message ?? 'sem resposta' }
}

const oficinas: string[] = []

async function main() {
  console.log('\n\x1b[1mA marca da oficina no Supabase de verdade\x1b[0m')
  console.log(`  ${URL}`)

  try {
    const { data: of, error: eOf } = await admin
      .from('oficinas')
      .insert({ nome: `[marca ${MARCA}] Oficina` })
      .select()
      .single()
    if (eOf || !of) throw new Error(`oficina: ${eOf?.message ?? 'sem retorno'}`)
    oficinas.push(of.id)

    async function criar(nome: string, perfil: string) {
      const email = `marca.${perfil}.${MARCA}@example.com`
      const { data: u, error } = await admin.auth.admin.createUser({
        email, password: SENHA, email_confirm: true,
      })
      if (error) throw new Error(`usuário ${perfil}: ${error.message}`)
      await admin.from('usuarios').insert({
        id: u.user!.id, oficina_id: of!.id, nome, email, perfil, ativo: true,
      })
      const cliente = createClient(URL!, ANON!, { auth: { persistSession: false } })
      const { error: eLogin } = await cliente.auth.signInWithPassword({ email, password: SENHA })
      if (eLogin) throw new Error(`login ${perfil}: ${eLogin.message}`)
      return cliente
    }

    const chefe = await criar('Chefe', 'admin')
    const vendedor = await criar('Vendedor', 'vendedor')
    ok('oficina de teste com admin e vendedor')

    // Quem pode ---------------------------------------------------------------
    const r1 = await chamar(vendedor, { acao: 'salvar', grande: PNG_MINIMO, miniatura: PNG_MINIMO })
    String(r1.erro).includes('perfil')
      ? ok('o vendedor não mexe na marca', String(r1.erro))
      : erro('vendedor', JSON.stringify(r1))

    const anonimo = createClient(URL!, ANON!, { auth: { persistSession: false } })
    const r2 = await chamar(anonimo, { acao: 'salvar', grande: PNG_MINIMO, miniatura: PNG_MINIMO })
    r2.erro ? ok('sem sessão, a função não grava nada') : erro('anônimo', JSON.stringify(r2))

    // O que entra -------------------------------------------------------------
    const naoEhPng = Buffer.from('<?php echo "oi"; ?>').toString('base64')
    const r3 = await chamar(chefe, { acao: 'salvar', grande: naoEhPng, miniatura: naoEhPng })
    String(r3.erro).includes('PNG')
      ? ok('o que não é PNG é recusado no servidor', String(r3.erro))
      : erro('arquivo disfarçado', JSON.stringify(r3))

    const gigante = Buffer.alloc(1024 * 1024 + 10, 1).toString('base64')
    const r4 = await chamar(chefe, { acao: 'salvar', grande: gigante, miniatura: PNG_MINIMO })
    String(r4.erro).includes('grande')
      ? ok('e o arquivo grande demais também', String(r4.erro))
      : erro('tamanho', JSON.stringify(r4))

    const r5 = await chamar(chefe, { acao: 'desconhecida' })
    String(r5.erro).includes('desconhecida')
      ? ok('ação inventada não faz nada')
      : erro('ação inválida', JSON.stringify(r5))

    // O caminho é escolhido no servidor ---------------------------------------
    const r6 = await chamar(chefe, { acao: 'salvar', grande: PNG_MINIMO, miniatura: PNG_MINIMO })
    r6.ok && String(r6.logo_url).includes(of.id)
      ? ok('o admin grava, na pasta da própria oficina')
      : erro('gravação', JSON.stringify(r6))

    const temVersao = /^https?:\/\/.+\?v=\d+$/.test(String(r6.logo_miniatura_url))
    temVersao
      ? ok('e o endereço leva versão, senão o navegador mostra o logo antigo')
      : erro('versão no endereço', String(r6.logo_miniatura_url))

    const semSessao = await fetch(String(r6.logo_miniatura_url))
    semSessao.status === 200 && semSessao.headers.get('content-type') === 'image/png'
      ? ok('o logo abre sem sessão nenhuma', 'é disso que a tela de entrar depende')
      : erro('leitura pública', `status ${semSessao.status}`)

    const { data: gravado } = await admin
      .from('oficinas').select('logo_url, logo_miniatura_url').eq('id', of.id).single()
    gravado?.logo_url && gravado.logo_miniatura_url
      ? ok('os dois tamanhos ficaram registrados na oficina')
      : erro('colunas', JSON.stringify(gravado))

    // A cor -------------------------------------------------------------------
    const { error: eCorRuim } = await chefe
      .from('oficinas').update({ cor_primaria: 'azul' }).eq('id', of.id)
    eCorRuim ? ok('o banco recusa cor que não é hexadecimal', eCorRuim.message.slice(0, 45))
             : erro('cor inválida', 'passou')

    const { error: eCorBoa } = await chefe
      .from('oficinas').update({ cor_primaria: '#60a5fa' }).eq('id', of.id)
    !eCorBoa ? ok('e aceita a cor escolhida na paleta') : erro('cor válida', eCorBoa.message)

    const { error: eCorVendedor } = await vendedor
      .from('oficinas').update({ cor_primaria: '#f87171' }).eq('id', of.id)
    const { data: aindaAzul } = await admin
      .from('oficinas').select('cor_primaria').eq('id', of.id).single()
    aindaAzul?.cor_primaria === '#60a5fa'
      ? ok('o vendedor não repinta a oficina', eCorVendedor ? 'recusado' : 'nenhuma linha atingida')
      : erro('vendedor mudou a cor', String(aindaAzul?.cor_primaria))

    // Remover -----------------------------------------------------------------
    const r7 = await chamar(chefe, { acao: 'remover' })
    const { data: depois } = await admin
      .from('oficinas').select('logo_url, logo_miniatura_url').eq('id', of.id).single()
    r7.ok && !depois?.logo_url && !depois?.logo_miniatura_url
      ? ok('remover limpa o arquivo e as duas colunas')
      : erro('remoção', JSON.stringify({ r7, depois }))
  } catch (e) {
    erro('preparo do cenário', (e as Error).message)
  } finally {
    // Limpeza -----------------------------------------------------------------
    const problemas: string[] = []
    for (const id of oficinas) {
      await admin.storage.from('logos').remove([`${id}/logo.png`, `${id}/logo-miniatura.png`])
      const { data: equipe } = await admin.from('usuarios').select('id').eq('oficina_id', id)
      problemas.push(...(await limparOficina(admin, id)))
      await admin.from('oficinas').delete().eq('id', id)
      for (const p of equipe ?? []) await admin.auth.admin.deleteUser(p.id)
    }
    const { data: sobrou } = await admin.from('oficinas').select('nome').like('nome', '[marca%')
    sobrou?.length === 0 && problemas.length === 0
      ? ok('limpeza: nada ficou para trás')
      : erro('limpeza', `${sobrou?.length ?? '?'} oficina(s) restante(s); ${problemas.join('; ')}`)
  }

  console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
  process.exit(falhou > 0 ? 1 : 0)
}

void main()
