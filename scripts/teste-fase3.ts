/**
 * Prova que as regras da Fase 3 funcionam no Supabase de verdade.
 *
 * O validar:banco roda as migrations num Postgres local e prova que o SQL está
 * certo. Este aqui prova outra coisa: que o SQL certo chegou inteiro ao projeto
 * de produção, passando pelo PostgREST, com usuários de verdade e o RLS ligado.
 * Uma migration pode estar impecável no arquivo e ter sido aplicada pela metade
 * no painel — já aconteceu nesta fase, e foi assim que se descobriu.
 *
 * Monta uma oficina fictícia, percorre o ciclo da ordem de serviço e apaga tudo
 * no fim. Precisa de .env.test.local.
 *
 *   npm run teste:fase3
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

const ok = (nome: string, detalhe = '') => {
  passou++
  console.log(`  \x1b[32m✓\x1b[0m ${nome}${detalhe ? ` (${detalhe})` : ''}`)
}
const erro = (nome: string, detalhe: string) => {
  falhou++
  falhas.push(`${nome} — ${detalhe}`)
  console.log(`  \x1b[31m✗\x1b[0m ${nome}\n      ${detalhe}`)
}

async function saldo(id: string): Promise<number> {
  const { data } = await admin.from('produtos').select('estoque_atual').eq('id', id).single()
  return Number(data?.estoque_atual ?? NaN)
}

const oficinas: string[] = []

async function main() {
  console.log('\n\x1b[1mFase 3 no Supabase de verdade\x1b[0m')
  console.log(`  ${URL}`)

  try {
    // Cenário -----------------------------------------------------------------
    const { data: of, error: eOf } = await admin
      .from('oficinas').insert({ nome: `[fase3 ${MARCA}] Oficina` }).select().single()
    if (eOf || !of) throw new Error(`oficina: ${eOf?.message ?? 'sem retorno'}`)
    oficinas.push(of.id)

    async function criar(nome: string, perfil: string): Promise<{ email: string; id: string }> {
      const email = `fase3.${perfil}.${MARCA}@example.com`
      const { data: u, error } = await admin.auth.admin.createUser({
        email, password: SENHA, email_confirm: true,
      })
      if (error) throw new Error(`usuário ${perfil}: ${error.message}`)
      await admin.from('usuarios').insert({
        id: u.user!.id, oficina_id: of!.id, nome, email, perfil, ativo: true,
      })
      return { email, id: u.user!.id }
    }
    const chefe = await criar('Tiago', 'admin')
    const mecanico = await criar('Marcos', 'mecanico')

    const app = createClient(URL!, ANON!, { auth: { persistSession: false } })
    const { error: eLogin } = await app.auth.signInWithPassword({ email: chefe.email, password: SENHA })
    if (eLogin) throw new Error(`login: ${eLogin.message}`)

    const appMecanico = createClient(URL!, ANON!, { auth: { persistSession: false } })
    await appMecanico.auth.signInWithPassword({ email: mecanico.email, password: SENHA })
    ok('oficina de teste com admin e mecânico')

    const { data: cli } = await app.from('clientes')
      .insert({ nome: 'Cliente Fase 3', telefone: '81988887777' }).select().single()
    const { data: moto, error: eMoto } = await app.rpc('criar_moto_com_proprietario', {
      p_cliente_id: cli!.id, p_placa: `FTQ${String(MARCA).slice(-4)}`,
      p_marca: 'Honda', p_modelo: 'CG 160', p_ano: 2020, p_cor: 'Preta',
      p_chassi: null, p_km_atual: 10000,
    })
    if (eMoto) throw new Error(`moto: ${eMoto.message}`)
    const motoId = (moto as { id: string }).id

    // Uma peça curta e uma sobrando: é o par que revelou os dois defeitos.
    const { data: curta } = await app.from('produtos')
      .insert({ nome: 'Óleo que vai faltar', unidade: 'un', preco_custo: 20, preco_venda: 40, estoque_atual: 1 })
      .select().single()
    const { data: sobrando } = await app.from('produtos')
      .insert({ nome: 'Peça que tem de sobra', unidade: 'un', preco_custo: 50, preco_venda: 100, estoque_atual: 20 })
      .select().single()

    // O valor tem de atravessar a aprovação ------------------------------------
    console.log('\n\x1b[1mO valor aprovado vira o valor da ordem\x1b[0m')

    const soma = 3 * 40 + 2 * 100
    const { data: orcId, error: eOrc } = await app.rpc('salvar_orcamento_com_itens', {
      p_orcamento_id: null, p_cliente_id: cli!.id, p_moto_id: motoId,
      p_km_registrado: 10000, p_validade_dias: 7, p_garantia_dias: 90,
      p_observacoes: null, p_desconto: soma * 0.1521, p_desconto_percentual: 15.21,
      p_itens: [
        { tipo: 'produto', produto_id: curta!.id, servico_id: null, descricao: 'Óleo que vai faltar', quantidade: 3, valor_unitario: 40 },
        { tipo: 'produto', produto_id: sobrando!.id, servico_id: null, descricao: 'Peça que tem de sobra', quantidade: 2, valor_unitario: 100 },
      ],
    })
    if (eOrc) throw new Error(`orçamento: ${eOrc.message}`)

    const { data: orc } = await admin.from('orcamentos')
      .select('valor_total').eq('id', orcId as string).single()

    const { data: osId, error: eAprov } = await app.rpc('aprovar_orcamento', {
      p_orcamento_id: orcId as string, p_responsavel_id: mecanico.id,
    })
    if (eAprov) throw new Error(`aprovar: ${eAprov.message}`)
    const os = osId as string

    const { data: ordem } = await admin.from('ordens_servico')
      .select('valor_total, desconto, desconto_tipo, status').eq('id', os).single()

    Number(ordem!.valor_total) === Number(orc!.valor_total)
      ? ok('a OS nasce com o valor aprovado, ao centavo', `R$ ${ordem!.valor_total}`)
      : erro('valor da OS', `orçamento ${orc!.valor_total}, OS ${ordem!.valor_total}`)

    ordem!.desconto_tipo === 'percentual' && Number(ordem!.desconto) === 15.21
      ? ok('o desconto vai como percentual, e não em reais')
      : erro('desconto na OS', `${ordem!.desconto} (${ordem!.desconto_tipo})`)

    // O ciclo ------------------------------------------------------------------
    console.log('\n\x1b[1mO ciclo, e quem pode cada passo\x1b[0m')

    const { error: ePulo } = await app.rpc('mudar_status_da_os', {
      p_ordem_servico_id: os, p_status: 'entregue',
    })
    ePulo ? ok('não dá para pular de aberta para entregue', ePulo.message)
          : erro('pulo de etapa', 'o banco aceitou')

    const { error: eInicio } = await appMecanico.rpc('mudar_status_da_os', {
      p_ordem_servico_id: os, p_status: 'em_andamento',
    })
    eInicio ? erro('mecânico inicia', eInicio.message) : ok('o mecânico começa o serviço')

    const { error: eMecFim } = await appMecanico.rpc('finalizar_os', {
      p_ordem_servico_id: os, p_permitir_negativo: false,
    })
    eMecFim ? ok('o mecânico NÃO finaliza', eMecFim.message)
            : erro('mecânico finaliza', 'o banco aceitou')

    await appMecanico.rpc('mudar_status_da_os', {
      p_ordem_servico_id: os, p_status: 'aguardando_conferencia',
    })
    const { data: pronta } = await admin.from('ordens_servico').select('status').eq('id', os).single()
    pronta!.status === 'aguardando_conferencia'
      ? ok('o mecânico marca como pronta para conferência')
      : erro('pronta para conferência', `status ${pronta!.status}`)

    const { count } = await admin.from('os_status_historico')
      .select('id', { count: 'exact', head: true }).eq('ordem_servico_id', os)
    count === 3
      ? ok('cada passo ficou registrado', `${count} linhas de histórico`)
      : erro('histórico de status', `esperava 3 linhas, veio ${count}`)

    // Estoque ------------------------------------------------------------------
    console.log('\n\x1b[1mFinalizar e cancelar mexendo no estoque\x1b[0m')

    const { error: eRecusa } = await app.rpc('finalizar_os', {
      p_ordem_servico_id: os, p_permitir_negativo: false,
    })
    eRecusa && /Falta peça/.test(eRecusa.message)
      ? ok('sem peça, finalizar para e diz o que falta', eRecusa.message.split('\n')[1])
      : erro('recusa por falta', eRecusa ? eRecusa.message : 'não recusou')

    const { data: faltas } = await app.rpc('faltas_para_finalizar_os', { p_ordem_servico_id: os })
    const lista = (faltas ?? []) as Array<{ nome: string }>
    lista.length === 1 && lista[0].nome === 'Óleo que vai faltar'
      ? ok('a lista traz só a peça que falta')
      : erro('lista de faltas', JSON.stringify(lista))

    const { error: eFim } = await app.rpc('finalizar_os', {
      p_ordem_servico_id: os, p_permitir_negativo: true,
    })
    if (eFim) throw new Error(`finalizar com confirmação: ${eFim.message}`)

    const { data: movs } = await admin.from('movimentacoes_estoque')
      .select('produto_id, motivo').eq('ordem_servico_id', os)
    const daCurta = movs!.find((m) => m.produto_id === curta!.id)!
    const daSobrando = movs!.find((m) => m.produto_id === sobrando!.id)!

    const marcada = (motivo: string) => /saldo insuficiente/.test(motivo)

    marcada(daCurta.motivo)
      ? ok('a peça que faltou sai marcada', daCurta.motivo)
      : erro('marca na peça em falta', daCurta.motivo)

    !marcada(daSobrando.motivo)
      ? ok('a peça com saldo NÃO leva a marca', daSobrando.motivo)
      : erro('marca sobrando na peça certa', daSobrando.motivo)

    const curtaDepois = await saldo(curta!.id)
    const sobrandoDepois = await saldo(sobrando!.id)
    curtaDepois === -2 && sobrandoDepois === 18
      ? ok('o estoque baixou das duas peças', `${curtaDepois} e ${sobrandoDepois}`)
      : erro('baixa de estoque', `veio ${curtaDepois} e ${sobrandoDepois}`)

    const { error: eItem } = await app.from('os_itens').insert({
      ordem_servico_id: os, tipo: 'avulso', descricao: 'Tarde demais',
      quantidade: 1, valor_unitario: 10, valor_total: 10,
    })
    eItem ? ok('ordem finalizada não aceita item novo', eItem.message)
          : erro('edição depois de finalizada', 'o banco aceitou')

    const { error: eCancel } = await app.rpc('cancelar_os', {
      p_ordem_servico_id: os, p_motivo: 'Teste automatizado',
    })
    eCancel ? erro('cancelar com saldo negativo', eCancel.message)
            : ok('cancelar a ordem finalizada com saldo negativo funciona')

    const curtaFim = await saldo(curta!.id)
    const sobrandoFim = await saldo(sobrando!.id)
    curtaFim === 1 && sobrandoFim === 20
      ? ok('as peças voltaram ao que eram', `${curtaFim} e ${sobrandoFim}`)
      : erro('estorno', `veio ${curtaFim} e ${sobrandoFim}`)
  } catch (e) {
    erro('execução interrompida', (e as Error).message)
  } finally {
    console.log('\n\x1b[1mLimpeza\x1b[0m')
    const problemas: string[] = []
    for (const id of oficinas) problemas.push(...(await limparOficina(admin, id)))
    problemas.push(...(await limparContasDeTeste(admin, [`fase3.`])))

    const { data: sobrou } = await admin.from('oficinas').select('nome').like('nome', '[fase3%')
    if (problemas.length || (sobrou?.length ?? 0) > 0) {
      erro('a oficina de teste NÃO saiu do banco', problemas.join(' | ') || 'oficina ainda existe')
    } else {
      ok('oficina de teste removida')
    }
  }

  console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
  if (falhas.length) {
    console.log('\nFalhas:')
    falhas.forEach((f) => console.log(`  - ${f}`))
  }
  process.exit(falhou === 0 ? 0 : 1)
}

void main()
