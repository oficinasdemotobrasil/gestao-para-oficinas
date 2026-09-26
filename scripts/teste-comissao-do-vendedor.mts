/**
 * O vendedor consegue aprovar um orçamento com indicador?
 *
 * A suspeita: `aprovar_orcamento` roda como invoker e insere em `comissoes`,
 * que só tem política de admin. Se for isso, o vendedor — justamente quem
 * anota o código do indicador no balcão — não consegue aprovar nada indicado,
 * e a aprovação inteira volta atrás.
 *
 *   npx tsx scripts/teste-comissao-do-vendedor.mts
 *
 * Monta uma oficina descartável com nome '[comissao …]' e apaga no fim. Não
 * toca em nenhuma oficina de verdade.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { limparOficina, limparContasDeTeste } from './limpar-teste'

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
const MARCA = Date.now()
const SENHA = `Teste!${randomUUID().slice(0, 10)}`

let passou = 0
let falhou = 0
const falhas: string[] = []
const ok = (n: string, d = '') => { passou++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? ` (${d})` : ''}`) }
const erro = (n: string, d: string) => { falhou++; falhas.push(`${n} — ${d}`); console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`) }

async function limparTudo() {
  console.log('\n\x1b[1mLimpeza\x1b[0m')
  const { data: antigas } = await admin.from('oficinas').select('id').like('nome', '[comissao%')
  const problemas: string[] = []
  for (const o of antigas ?? []) problemas.push(...(await limparOficina(admin, o.id)))
  problemas.push(...(await limparContasDeTeste(admin, ['comissao.'])))
  const { data: sobrou } = await admin.from('oficinas').select('nome').like('nome', '[comissao%')
  if (problemas.length || (sobrou?.length ?? 0) > 0) {
    erro('a oficina de teste NÃO saiu do banco', problemas.join(' | ') || 'ainda existe')
  } else ok('oficina de teste removida')
}

async function main() {
  console.log('\n\x1b[1mComissão: quem pode aprovar um orçamento indicado\x1b[0m')
  console.log(`  ${URL}`)

  const { data: of, error: eOf } = await admin
    .from('oficinas')
    .insert({ nome: `[comissao ${MARCA}] Oficina`, plano: 'completo' })
    .select().single()
  if (eOf || !of) throw new Error(`oficina: ${eOf?.message ?? 'sem retorno'}`)

  async function criar(nome: string, perfil: string) {
    const email = `comissao.${perfil}.${MARCA}@example.com`
    const { data: u, error } = await admin.auth.admin.createUser({
      email, password: SENHA, email_confirm: true,
    })
    if (error) throw new Error(`usuário ${perfil}: ${error.message}`)
    await admin.from('usuarios').insert({
      id: u.user!.id, oficina_id: of!.id, nome, email, perfil, ativo: true,
    })
    return email
  }
  const emailChefe = await criar('Chefe', 'admin')
  const emailVendedor = await criar('Vendedora', 'vendedor')

  const app = createClient(URL!, ANON!, { auth: { persistSession: false } })
  await app.auth.signInWithPassword({ email: emailChefe, password: SENHA })
  const loja = createClient(URL!, ANON!, { auth: { persistSession: false } })
  await loja.auth.signInWithPassword({ email: emailVendedor, password: SENHA })
  ok('oficina com admin e vendedora')

  // O indicador, cadastrado pelo admin.
  const { data: ind, error: eInd } = await app
    .from('indicadores')
    .insert({ nome: 'João das Motos', codigo: `JOAO${String(MARCA).slice(-4)}`, percentual: 15 })
    .select().single()
  if (eInd || !ind) throw new Error(`indicador: ${eInd?.message ?? 'sem retorno'}`)
  ok('admin cadastrou o indicador', `${ind.codigo} a ${ind.percentual}%`)

  // A vendedora acha o indicador pelo código: é o caminho da tela dela.
  const { data: achado, error: eAchado } = await loja.rpc('indicador_por_codigo', {
    p_codigo: ind.codigo.toLowerCase(),
  })
  const primeiro = (achado as Array<{ id: string; percentual: number }> | null)?.[0]
  if (eAchado) erro('vendedora acha o indicador pelo código', eAchado.message)
  else if (!primeiro) erro('vendedora acha o indicador pelo código', 'não veio nada')
  else ok('vendedora acha o indicador pelo código', `${primeiro.percentual}%`)

  // Cliente e moto, pela vendedora.
  const { data: cli } = await loja
    .from('clientes').insert({ nome: 'Cliente Indicado', telefone: '81988887777' }).select().single()
  const { data: moto } = await loja.rpc('criar_moto_com_proprietario', {
    p_cliente_id: cli!.id, p_placa: `CMS${String(MARCA).slice(-4)}`,
    p_marca: 'Honda', p_modelo: 'CG 160', p_ano: 2021, p_cor: 'Preta',
    p_chassi: null, p_km_atual: 10000,
  })
  const motoId = (moto as { id: string }).id

  const itens = [
    { tipo: 'avulso', produto_id: null, servico_id: null, descricao: 'Revisão', quantidade: 1, valor_unitario: 400 },
  ]

  const salvar = (cliente: typeof app) =>
    cliente.rpc('salvar_orcamento_com_itens', {
      p_orcamento_id: null, p_cliente_id: cli!.id, p_moto_id: motoId,
      p_km_registrado: 10000, p_validade_dias: 7, p_garantia_dias: 90,
      p_observacoes: null, p_desconto: 0, p_desconto_percentual: null,
      p_itens: itens, p_indicador_id: ind.id,
    })

  // 1. A vendedora monta o orçamento com indicador.
  const { data: orcVendedora, error: eOrc } = await salvar(loja)
  if (eOrc) erro('vendedora salva orçamento com indicador', eOrc.message)
  else ok('vendedora salva orçamento com indicador')

  // 2. E tenta aprovar. É aqui que a suspeita se resolve.
  if (orcVendedora) {
    const { data: idUsuario } = await loja.from('usuarios').select('id').limit(1)
    const { error: eAprov } = await loja.rpc('aprovar_orcamento', {
      p_orcamento_id: orcVendedora as string,
      p_responsavel_id: (idUsuario as Array<{ id: string }>)[0].id,
    })
    if (eAprov) {
      erro('VENDEDORA APROVA orçamento com indicador', `${eAprov.code ?? ''} ${eAprov.message}`)
    } else {
      const { count } = await admin
        .from('comissoes').select('*', { count: 'exact', head: true }).eq('oficina_id', of.id)
      ok('vendedora aprova orçamento com indicador', `${count} comissão gerada`)
    }
  }

  // 3. Controle: o admin aprova o mesmo caminho sem problema?
  const { data: orcAdmin, error: eOrc2 } = await salvar(app)
  if (eOrc2) erro('admin salva orçamento com indicador', eOrc2.message)
  else {
    const { data: eu } = await app.from('usuarios').select('id').eq('email', emailChefe).single()
    const { error: eAprov2 } = await app.rpc('aprovar_orcamento', {
      p_orcamento_id: orcAdmin as string, p_responsavel_id: eu!.id,
    })
    if (eAprov2) erro('admin aprova orçamento com indicador', `${eAprov2.code ?? ''} ${eAprov2.message}`)
    else {
      const { data: com } = await admin
        .from('comissoes').select('base, percentual, valor, status').eq('oficina_id', of.id)
      const c = (com ?? [])[0]
      if (!c) erro('comissão do admin', 'nenhuma comissão foi criada')
      else if (Number(c.valor) !== 60) erro('valor da comissão', `esperava 60,00 e veio ${c.valor}`)
      else ok('admin aprova e a comissão nasce certa', `base ${c.base}, ${c.percentual}% = ${c.valor}`)
    }
  }

  // 4. Controle: sem indicador, a vendedora aprova?
  const { data: orcSemIndicador } = await loja.rpc('salvar_orcamento_com_itens', {
    p_orcamento_id: null, p_cliente_id: cli!.id, p_moto_id: motoId,
    p_km_registrado: 10000, p_validade_dias: 7, p_garantia_dias: 90,
    p_observacoes: null, p_desconto: 0, p_desconto_percentual: null,
    p_itens: itens, p_indicador_id: null,
  })
  const { data: idV } = await loja.from('usuarios').select('id').limit(1)
  const { error: eAprov3 } = await loja.rpc('aprovar_orcamento', {
    p_orcamento_id: orcSemIndicador as string,
    p_responsavel_id: (idV as Array<{ id: string }>)[0].id,
  })
  if (eAprov3) erro('vendedora aprova orçamento SEM indicador', eAprov3.message)
  else ok('vendedora aprova orçamento sem indicador', 'o caminho normal dela funciona')
}

try {
  await main()
} catch (e) {
  erro('o teste parou no meio', e instanceof Error ? e.message : String(e))
} finally {
  await limparTudo()
}

console.log(`\n\x1b[1m${passou} passaram, ${falhou} falharam\x1b[0m`)
if (falhas.length) {
  console.log('\nFalhas:')
  for (const f of falhas) console.log(`  - ${f}`)
}
console.log('')
process.exit(falhou > 0 ? 1 : 0)
