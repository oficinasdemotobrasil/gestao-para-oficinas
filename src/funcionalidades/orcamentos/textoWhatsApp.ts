import { moeda, exibirPlaca, data, quantidade as formatarQuantidade } from '@/lib/formato'
import type { OrcamentoCompleto } from './api'

/**
 * Monta a mensagem do orçamento para o WhatsApp.
 *
 * O asterisco é a marcação de negrito do WhatsApp. Os títulos de seção e o
 * total vão em negrito porque são o que a pessoa procura ao abrir a conversa
 * três dias depois — o resto é leitura corrida.
 *
 * Cada linha é curta de propósito: no celular, o WhatsApp quebra linha sozinho
 * e uma frase longa vira um bloco ilegível.
 */
export function textoDoOrcamento(
  orcamento: OrcamentoCompleto,
  nomeDaOficina: string,
): string {
  const numero = String(orcamento.numero).padStart(4, '0')
  const linhas: string[] = [`*Orçamento nº ${numero} — ${nomeDaOficina}*`, '']

  if (orcamento.cliente?.nome) linhas.push(`Cliente: ${orcamento.cliente.nome}`)

  if (orcamento.moto) {
    const modelo = [orcamento.moto.marca, orcamento.moto.modelo].filter(Boolean).join(' ')
    linhas.push(
      modelo
        ? `Moto: ${modelo} — placa ${exibirPlaca(orcamento.moto.placa)}`
        : `Moto: placa ${exibirPlaca(orcamento.moto.placa)}`,
    )
  }

  if (orcamento.km_registrado) {
    linhas.push(`Km: ${new Intl.NumberFormat('pt-BR').format(orcamento.km_registrado)}`)
  }

  const grupos = [
    { titulo: 'Peças', tipo: 'produto' as const },
    { titulo: 'Serviços', tipo: 'servico' as const },
    { titulo: 'Outros', tipo: 'avulso' as const },
  ]

  for (const grupo of grupos) {
    const itens = orcamento.itens.filter((i) => i.tipo === grupo.tipo)
    if (itens.length === 0) continue

    linhas.push('', `*${grupo.titulo}*`)
    for (const item of itens) {
      const qtd = Number(item.quantidade)
      const valor = moeda(Number(item.valor_unitario))
      // Peça se conta, serviço normalmente não: a quantidade só aparece quando
      // acrescenta informação.
      const comQuantidade = grupo.tipo === 'produto' || qtd !== 1
      linhas.push(
        comQuantidade
          ? `• ${item.descricao} — ${formatarQuantidade(qtd)}x ${valor}`
          : `• ${item.descricao} — ${valor}`,
      )
    }
  }

  linhas.push('')
  if (Number(orcamento.desconto) > 0) {
    linhas.push(`Desconto: ${moeda(Number(orcamento.desconto))}`)
  }
  linhas.push(`*Total: ${moeda(Number(orcamento.valor_total))}*`)

  linhas.push('')
  if (orcamento.validade_ate) linhas.push(`Válido até ${data(orcamento.validade_ate)}`)
  linhas.push(`Garantia de ${orcamento.garantia_dias} dias sobre os serviços.`)

  if (orcamento.observacoes?.trim()) {
    linhas.push('', orcamento.observacoes.trim())
  }

  return linhas.join('\n')
}

// O endereço do WhatsApp mora em lib/whatsapp: a mesma regra servia três
// telas, em três cópias.
export { enderecoDoWhatsApp } from '@/lib/whatsapp'
