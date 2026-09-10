/**
 * Assinar e cancelar, contra o sandbox do provedor.
 *
 * Nenhum dinheiro real se move: o sandbox é um ambiente separado, com conta
 * própria. O que este teste prova é a parte que dá para provar sem cartão —
 * que a assinatura é criada lá, que os identificadores voltam para o nosso
 * banco, e principalmente que ASSINAR NÃO LIBERA ACESSO.
 *
 * Esse último ponto é o coração: se assinar liberasse, bastaria clicar e
 * fechar a tela para usar de graça. Quem libera é o webhook, quando o dinheiro
 * entra — e isso o teste:webhook já prova.
 *
 *   npm run teste:assinatura
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

let passou = 0
let falhou = 0
const ok = (n: string, d = '') => { passou++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? ` (${d})` : ''}`) }
const erro = (n: string, d: string) => { falhou++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`) }

const MARCA = Date.now()
const SENHA = `Assina!${MARCA}`

/**
 * Um CNPJ de teste com os dígitos verificadores corretos.
 *
 * O provedor confere o cálculo antes de aceitar o cadastro, então um número
 * inventado ao acaso seria recusado e o teste não chegaria a exercer nada.
 * É ficha de teste em ambiente de teste: não corresponde a empresa nenhuma e
 * nenhum dinheiro real se move.
 */
function cpfDeTeste(semente: number): string {
  const base = String(semente).padStart(9, '0').slice(-9).split('').map(Number)
  const digito = (nums: number[]) => {
    const inicio = nums.length + 1
    const soma = nums.reduce((a, n, i) => a + n * (inicio - i), 0)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  const d1 = digito(base)
  const d2 = digito([...base, d1])
  return [...base, d1, d2].join('')
}

function cnpjDeTeste(semente: number): string {
  const base = String(semente).padStart(12, '0').slice(-12).split('').map(Number)
  const digito = (nums: number[]) => {
    const pesos = nums.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const soma = nums.reduce((a, n, i) => a + n * pesos[i], 0)
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  const d1 = digito(base)
  const d2 = digito([...base, d1])
  return [...base, d1, d2].join('')
}

async function main() {
  console.log('\n\x1b[1mAssinar e cancelar, no sandbox do provedor\x1b[0m')

  let oficinaId = ''
  let contaId = ''

  try {
    const { data: of, error: eOf } = await admin
      .from('oficinas')
      .insert({ nome: 'Oficina que Assina', cidade: '[teste-assinatura]', plano: 'gratuito', telefone: '(81) 99999-0000' })
      .select().single()
    if (eOf || !of) throw new Error(`oficina: ${eOf?.message}`)
    oficinaId = of.id

    const email = `assina.teste.${MARCA}@example.com`
    const { data: conta, error: eConta } = await admin.auth.admin.createUser({
      email, password: SENHA, email_confirm: true,
    })
    if (eConta || !conta.user) throw new Error(`conta: ${eConta?.message}`)
    contaId = conta.user.id
    await admin.from('usuarios').insert({
      id: contaId, oficina_id: oficinaId, nome: 'Dona da Oficina',
      email, perfil: 'admin', ativo: true,
    })

    const app = createClient(URL!, ANON!, { auth: { persistSession: false } })
    const { error: eLogin } = await app.auth.signInWithPassword({ email, password: SENHA })
    if (eLogin) throw new Error(`login: ${eLogin.message}`)
    ok('oficina de teste, no plano gratuito e sem documento')

    type Resposta = Record<string, unknown>
    const chamar = async (body: Record<string, unknown>): Promise<Resposta> => {
      const r = await app.functions.invoke('assinatura', { body })
      if (r.data) return r.data as Resposta
      // A função explica no corpo; o erro do invoke só diz o número.
      const contexto = (r.error as { context?: { text?: () => Promise<string> } })?.context
      if (contexto?.text) {
        try { return JSON.parse(await contexto.text()) as Resposta } catch { /* sem corpo */ }
      }
      return { erro: r.error?.message ?? 'sem resposta' } as Resposta
    }

    // Sem documento, o provedor recusaria com uma mensagem dele. Melhor dizer
    // antes, em português, com o caminho da solução.
    const semDocumento = await chamar({ acao: 'assinar', plano: 'completo' })
    String(semDocumento.erro).includes('CPF') && semDocumento.campo === 'cnpj'
      ? ok('sem documento, a função explica o que fazer antes de tentar cobrar')
      : erro('sem documento', JSON.stringify(semDocumento))

    // O CNPJ passa pela conferência de documento: se a mensagem que volta é
    // sobre o plano, o documento já foi aceito. Barato, e sem criar assinatura
    // de verdade só para provar isso.
    await admin.from('oficinas').update({ cnpj: cnpjDeTeste(MARCA) }).eq('id', oficinaId)
    const comCnpj = await chamar({ acao: 'assinar', plano: 'gratuito' })
    !String(comCnpj.erro).includes('CPF')
      ? ok('CNPJ passa pela conferência de documento')
      : erro('CNPJ', JSON.stringify(comCnpj))

    // E CPF também: muita oficina de bairro fatura no CPF do dono e não tem
    // empresa aberta. Se este caminho quebrar, essa gente não consegue assinar.
    await admin.from('oficinas').update({ cnpj: cpfDeTeste(MARCA) }).eq('id', oficinaId)

    const planoInvalido = await chamar({ acao: 'assinar', plano: 'gratuito' })
    String(planoInvalido.erro).includes('plano pago')
      ? ok('não dá para "assinar" o plano gratuito')
      : erro('plano gratuito', JSON.stringify(planoInvalido))

    // Boleto foi tirado de propósito: compensa em até dois dias, e numa
    // mensalidade barata isso põe a oficina em atraso todo mês sem culpa.
    const comBoleto = await chamar({ acao: 'assinar', plano: 'completo', forma: 'BOLETO' })
    String(comBoleto.erro).includes('PIX ou cartão')
      ? ok('boleto é recusado, com a alternativa dita na mensagem')
      : erro('boleto', JSON.stringify(comBoleto))

    // Débito também não: o provedor não oferece débito em assinatura
    // recorrente (conferido na documentação dele, não suposto).
    const comDebito = await chamar({ acao: 'assinar', plano: 'completo', forma: 'DEBIT_CARD' })
    String(comDebito.erro).includes('PIX ou cartão')
      ? ok('débito também, porque não existe para recorrência')
      : erro('débito', JSON.stringify(comDebito))

    // A assinatura de verdade ----------------------------------------------------
    const assinou = await chamar({ acao: 'assinar', plano: 'completo', forma: 'PIX' })
    assinou.ok === true && assinou.valor === 49.99
      ? ok('a assinatura é criada no provedor, no CPF e por PIX', `R$ ${assinou.valor}, vence em ${assinou.vencimento}`)
      : erro('assinar', JSON.stringify(assinou))

    assinou.link_da_fatura
      ? ok('e volta com o link da primeira fatura', String(assinou.link_da_fatura).slice(0, 48) + '…')
      : erro('link da fatura', 'não veio — a oficina não teria onde pagar')

    const { data: registrada } = await admin
      .from('assinaturas').select('situacao, plano, id_externo_cliente, id_externo_assinatura')
      .eq('oficina_id', oficinaId).maybeSingle()
    registrada?.id_externo_cliente && registrada.id_externo_assinatura && registrada.plano === 'completo'
      ? ok('os identificadores do provedor ficaram guardados', 'é por eles que o webhook acha a oficina')
      : erro('registro da assinatura', JSON.stringify(registrada))

    // O ponto central -------------------------------------------------------------
    const { data: depois } = await admin
      .from('oficinas').select('acesso_ate').eq('id', oficinaId).single()
    depois?.acesso_ate === null
      ? ok('ASSINAR NÃO LIBERA ACESSO', 'quem libera é o webhook, quando o dinheiro entra')
      : erro('acesso liberado cedo demais', `acesso_ate virou ${depois?.acesso_ate}`)

    const denovo = await chamar({ acao: 'assinar', plano: 'essencial', forma: 'CREDIT_CARD' })
    String(denovo.erro).includes('já tem uma assinatura')
      ? ok('e não dá para assinar duas vezes')
      : erro('assinatura duplicada', JSON.stringify(denovo))

    // Cancelar ----------------------------------------------------------------------
    await admin.from('oficinas').update({ acesso_ate: '2099-12-31' }).eq('id', oficinaId)
    const cancelou = await chamar({ acao: 'cancelar', motivo: 'teste' })
    const { data: aposCancelar } = await admin
      .from('assinaturas').select('situacao, cancelada_em').eq('oficina_id', oficinaId).maybeSingle()
    const { data: acessoDepois } = await admin
      .from('oficinas').select('acesso_ate').eq('id', oficinaId).single()

    cancelou.ok === true && aposCancelar?.situacao === 'encerrada'
      ? ok('cancelar encerra a assinatura no provedor e aqui')
      : erro('cancelar', JSON.stringify({ cancelou, aposCancelar }))

    acessoDepois?.acesso_ate === '2099-12-31'
      ? ok('e o acesso continua até o fim do período pago', 'foi o que a oficina comprou')
      : erro('acesso após cancelar', String(acessoDepois?.acesso_ate))
  } catch (e) {
    erro('execução', (e as Error).message)
  } finally {
    if (oficinaId) {
      await admin.from('eventos_asaas').delete().eq('oficina_id', oficinaId)
      await admin.from('assinaturas').delete().eq('oficina_id', oficinaId)
      await limparOficina(admin, oficinaId)
      await admin.from('oficinas').delete().eq('id', oficinaId)
    }
    if (contaId) await admin.auth.admin.deleteUser(contaId)
    const { data: sobrou } = await admin
      .from('oficinas').select('nome').eq('cidade', '[teste-assinatura]')
    sobrou?.length === 0
      ? ok('limpeza: nada ficou para trás no nosso banco')
      : erro('limpeza', JSON.stringify(sobrou))
  }

  console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
  console.log('\nO cliente de teste continua no sandbox do provedor — lá é ambiente de teste.')
  process.exit(falhou > 0 ? 1 : 0)
}

void main()
