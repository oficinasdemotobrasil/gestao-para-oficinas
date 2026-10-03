/**
 * Fotos da OS contra o banco e o Storage de verdade (migration 0079).
 *
 * O validar-banco prova as regras numa cópia local; este prova o que só o
 * Supabase real tem: o envio do arquivo, o limite de tamanho e de tipo do
 * bucket, o endereço temporário que abre a foto, e a limpeza das vencidas pela
 * função `plataforma`.
 *
 * Roda numa oficina descartável e apaga tudo no fim — fotos inclusive.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
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

/** Um JPEG de verdade, mínimo (1x1). O bucket confere o tipo declarado. */
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
)

async function limparTudo() {
  console.log('\n\x1b[1mLimpeza\x1b[0m')
  const { data: antigas } = await admin.from('oficinas').select('id').like('nome', '[fotos%')
  const problemas: string[] = []
  for (const o of antigas ?? []) problemas.push(...(await limparOficina(admin, o.id)))
  problemas.push(...(await limparContasDeTeste(admin, ['fotos.'])))
  const { data: sobrou } = await admin.from('oficinas').select('nome').like('nome', '[fotos%')
  if (problemas.length || (sobrou?.length ?? 0) > 0) {
    erro('a oficina de teste NÃO saiu do banco', problemas.join(' | ') || 'ainda existe')
  } else ok('oficina de teste removida, com as fotos')
}

async function main() {
  console.log('\n\x1b[1mFotos da OS — banco e Storage de verdade\x1b[0m')
  console.log(`  ${URL}`)

  async function oficinaCom(nome: string) {
    const { data: of, error } = await admin
      .from('oficinas').insert({ nome: `[fotos ${MARCA}] ${nome}`, plano: 'completo' }).select().single()
    if (error || !of) throw new Error(`oficina: ${error?.message}`)
    return of as { id: string }
  }
  async function pessoa(oficinaId: string, perfil: string) {
    const email = `fotos.${perfil}.${oficinaId.slice(0, 6)}.${MARCA}@example.com`
    const { data: u, error } = await admin.auth.admin.createUser({ email, password: SENHA, email_confirm: true })
    if (error) throw new Error(`usuário: ${error.message}`)
    await admin.from('usuarios').insert({ id: u.user!.id, oficina_id: oficinaId, nome: perfil, email, perfil, ativo: true })
    const c = createClient(URL!, ANON!, { auth: { persistSession: false } })
    await c.auth.signInWithPassword({ email, password: SENHA })
    return { c, id: u.user!.id }
  }

  const of = await oficinaCom('Oficina')
  const vizinha = await oficinaCom('Vizinha')
  const dono = await pessoa(of.id, 'admin')
  const mecanico = await pessoa(of.id, 'mecanico')
  const donoVizinho = await pessoa(vizinha.id, 'admin')
  ok('duas oficinas, com dono e mecânico')

  const { data: cli } = await dono.c.from('clientes').insert({ nome: 'Cliente' }).select().single()
  const { data: moto } = await dono.c.rpc('criar_moto_com_proprietario', {
    p_cliente_id: cli!.id, p_placa: `FOT${String(MARCA).slice(-4)}`,
    p_marca: 'Honda', p_modelo: 'CG', p_ano: 2020, p_cor: null, p_chassi: null, p_km_atual: 1000,
  })
  async function novaOs(responsavel: string) {
    const { data: orc, error } = await dono.c.rpc('salvar_orcamento_com_itens', {
      p_orcamento_id: null, p_cliente_id: cli!.id, p_moto_id: (moto as { id: string }).id,
      p_km_registrado: 1000, p_validade_dias: 7, p_garantia_dias: 0,
      p_observacoes: null, p_desconto: 0, p_desconto_percentual: null,
      p_itens: [{ tipo: 'avulso', produto_id: null, servico_id: null, descricao: 'Revisão', quantidade: 1, valor_unitario: 100 }],
      p_indicador_id: null,
    })
    if (error) throw new Error(`orçamento: ${error.message}`)
    const { data: os, error: eAp } = await dono.c.rpc('aprovar_orcamento', { p_orcamento_id: orc, p_responsavel_id: responsavel })
    if (eAp) throw new Error(`aprovar: ${eAp.message}`)
    return os as string
  }
  const osDoMecanico = await novaOs(mecanico.id)
  const osDoDono = await novaOs(dono.id)

  /** O mesmo caminho que o app faz: linha, arquivo, marca. */
  async function enviar(c: SupabaseClient, ordem: string, arquivo: Buffer = JPEG, tipo = 'image/jpeg') {
    const id = randomUUID()
    const caminho = `${of.id}/${ordem}/${id}.jpg`
    const { error: e1 } = await c.from('os_fotos').insert({ id, ordem_servico_id: ordem, momento: 'servico', caminho, bytes: arquivo.length })
    if (e1) return { erro: e1.message, caminho }
    const { error: e2 } = await c.storage.from('fotos-os').upload(caminho, arquivo, { contentType: tipo, upsert: false })
    if (e2) {
      await c.from('os_fotos').delete().eq('id', id)
      return { erro: e2.message, caminho }
    }
    const { error: e3 } = await c.from('os_fotos').update({ enviada: true }).eq('id', id)
    return { erro: e3?.message ?? null, caminho }
  }

  // Envio e leitura ----------------------------------------------------------
  const primeira = await enviar(dono.c, osDoDono)
  primeira.erro ? erro('o dono envia uma foto', primeira.erro) : ok('o dono envia uma foto de verdade')

  const { data: assinado } = await dono.c.storage.from('fotos-os').createSignedUrl(primeira.caminho, 60)
  const abriu = assinado?.signedUrl ? await fetch(assinado.signedUrl) : null
  abriu?.ok ? ok('e abre pelo endereço temporário', `${abriu.status}`) : erro('endereço temporário', `${abriu?.status}`)

  const direto = await fetch(`${URL}/storage/v1/object/public/fotos-os/${primeira.caminho}`)
  !direto.ok ? ok('sem endereço temporário a foto não abre (bucket privado)', `${direto.status}`) : erro('bucket privado', 'abriu sem assinatura')

  // O bucket recusa o que não é foto reduzida --------------------------------
  const grande = await enviar(dono.c, osDoDono, Buffer.alloc(1_200_000, 1))
  grande.erro ? ok('arquivo acima de 1 MB é recusado', grande.erro) : erro('limite de tamanho', 'aceitou 1,2 MB')
  const png = await enviar(dono.c, osDoDono, JPEG, 'image/png')
  png.erro ? ok('arquivo que não é JPEG é recusado', png.erro) : erro('limite de tipo', 'aceitou PNG')
  const { count: reservasPresas } = await admin
    .from('os_fotos').select('*', { count: 'exact', head: true }).eq('ordem_servico_id', osDoDono).eq('enviada', false)
  reservasPresas === 0 ? ok('envio recusado não deixa vaga presa') : erro('vaga presa', `${reservasPresas} linha(s) sem arquivo`)

  // Mecânico -------------------------------------------------------------------
  const doMecanico = await enviar(mecanico.c, osDoMecanico)
  doMecanico.erro ? erro('o mecânico fotografa a OS dele', doMecanico.erro) : ok('o mecânico fotografa a OS dele')
  const naDoDono = await enviar(mecanico.c, osDoDono)
  naDoDono.erro ? ok('mas não a OS de outro', naDoDono.erro) : erro('mecânico em OS alheia', 'conseguiu')
  const { data: vistas } = await mecanico.c.from('os_fotos').select('id').eq('ordem_servico_id', osDoDono)
  vistas?.length === 0 ? ok('nem vê as fotos dela') : erro('mecânico vê foto alheia', `${vistas?.length}`)
  const { data: urlAlheia } = await mecanico.c.storage.from('fotos-os').createSignedUrl(primeira.caminho, 60)
  !urlAlheia?.signedUrl ? ok('nem consegue endereço para o arquivo dela') : erro('mecânico assina foto alheia', 'conseguiu')
  const { data: apagou } = await mecanico.c.storage.from('fotos-os').remove([doMecanico.caminho])
  ;(apagou?.length ?? 0) === 0 ? ok('o mecânico não apaga foto enviada') : erro('mecânico apagou foto', 'apagou')

  // A vizinha ------------------------------------------------------------------
  const { data: daVizinha } = await donoVizinho.c.from('os_fotos').select('id')
  daVizinha?.length === 0 ? ok('a outra oficina não vê as fotos') : erro('isolamento', `${daVizinha?.length}`)
  const { data: urlVizinha } = await donoVizinho.c.storage.from('fotos-os').createSignedUrl(primeira.caminho, 60)
  !urlVizinha?.signedUrl ? ok('nem abre o arquivo') : erro('isolamento do arquivo', 'abriu')

  // Cinco por OS ---------------------------------------------------------------
  for (let i = 0; i < 4; i++) await enviar(dono.c, osDoDono)
  const sexta = await enviar(dono.c, osDoDono)
  sexta.erro ? ok('a sexta foto da OS é recusada', sexta.erro) : erro('limite por OS', 'aceitou a sexta')

  // O uso e o limite -----------------------------------------------------------
  const { data: uso } = await dono.c.rpc('minhas_fotos_em_uso')
  const u = uso as { em_uso: number; limite: number }
  u?.em_uso === 6 && u?.limite === 2000
    ? ok('o uso aparece para a oficina', `${u.em_uso} de ${u.limite}`)
    : erro('uso de fotos', JSON.stringify(uso))

  // A limpeza ------------------------------------------------------------------
  // A OS do mecânico é entregue e recuada 40 dias, sem garantia: venceu.
  await mecanico.c.rpc('mudar_status_da_os', { p_ordem_servico_id: osDoMecanico, p_status: 'em_andamento' })
  await dono.c.rpc('finalizar_os', { p_ordem_servico_id: osDoMecanico, p_permitir_negativo: false })
  const { error: eEnt } = await dono.c.rpc('mudar_status_da_os', { p_ordem_servico_id: osDoMecanico, p_status: 'entregue' })
  if (eEnt) throw new Error(`entregar: ${eEnt.message}`)
  const quarentaDias = new Date(Date.now() - 40 * 86_400_000).toISOString()
  const { error: eData } = await admin.from('ordens_servico')
    .update({ data_conclusao: quarentaDias }).eq('id', osDoMecanico)
  if (eData) throw new Error(`recuar data: ${eData.message}`)

  const { data: depois } = await dono.c.from('os_fotos').select('id').eq('ordem_servico_id', osDoMecanico)
  depois?.length === 0 ? ok('vencida, a foto some da tela na hora') : erro('foto vencida visível', `${depois?.length}`)

  // A função da plataforma apaga o arquivo e a linha ao listar.
  const emailPlat = `fotos.plat.${MARCA}@example.com`
  const { data: plat } = await admin.auth.admin.createUser({ email: emailPlat, password: SENHA, email_confirm: true })
  await admin.from('admins_plataforma').insert({ usuario_id: plat.user!.id, observacao: 'temporário fotos' })
  try {
    const cp = createClient(URL!, ANON!, { auth: { persistSession: false } })
    const { data: sp } = await cp.auth.signInWithPassword({ email: emailPlat, password: SENHA })
    const r = await fetch(`${URL}/functions/v1/plataforma`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sp.session!.access_token}`, 'Content-Type': 'application/json', apikey: ANON! },
      body: JSON.stringify({ acao: 'listar' }),
    })
    const j = await r.json()
    const minha = (j.oficinas ?? []).find((o: { id: string }) => o.id === of.id)
    r.ok && minha?.fotos?.em_uso === 5
      ? ok('o painel mostra o uso de fotos da oficina', `${minha.fotos.em_uso} de ${minha.fotos.limite}`)
      : erro('uso no painel', `${r.status} ${JSON.stringify(minha?.fotos ?? j.erro)}`)

    const { count: linhas } = await admin.from('os_fotos')
      .select('*', { count: 'exact', head: true }).eq('ordem_servico_id', osDoMecanico)
    const { data: arquivos } = await admin.storage.from('fotos-os').list(`${of.id}/${osDoMecanico}`)
    linhas === 0 && (arquivos?.length ?? 0) === 0
      ? ok('e a limpeza apagou a foto vencida: arquivo e linha')
      : erro('limpeza', `${linhas} linha(s), ${arquivos?.length} arquivo(s)`)
  } finally {
    await admin.from('admins_plataforma').delete().eq('usuario_id', plat.user!.id)
    await admin.auth.admin.deleteUser(plat.user!.id)
  }
}

try {
  await main()
} catch (e) {
  erro('o teste parou no meio', e instanceof Error ? e.message : String(e))
} finally {
  await limparTudo()
  const { data: restos } = await admin.storage.from('fotos-os').list('')
  const nossos = (restos ?? []).length
  console.log(`  pastas no bucket depois da limpeza: ${nossos}`)
}

console.log(`\n\x1b[1m${passou} passaram, ${falhou} falharam\x1b[0m`)
if (falhas.length) {
  console.log('\nFalhas:')
  for (const f of falhas) console.log(`  - ${f}`)
}
console.log('')
process.exit(falhou > 0 ? 1 : 0)
