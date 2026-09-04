import { moeda, exibirPlaca, data } from '@/lib/formato'
import type { OrdemCompleta } from './api'

/**
 * O aviso de que a moto está pronta.
 *
 * Curto de propósito: é uma mensagem de "pode vir buscar", não um relatório. O
 * detalhe do serviço vai no PDF, para quem pedir. O valor entra porque é a
 * primeira pergunta que o cliente faz em seguida — e saber antes de chegar
 * evita a conversa constrangida no balcão.
 */
export function textoDeServicoPronto(
  ordem: OrdemCompleta,
  nomeDaOficina: string,
): string {
  const primeiroNome = (ordem.cliente?.nome ?? '').split(' ')[0]
  const modelo = [ordem.moto?.marca, ordem.moto?.modelo].filter(Boolean).join(' ')
  const moto = modelo || (ordem.moto ? exibirPlaca(ordem.moto.placa) : 'sua moto')

  const linhas: string[] = [
    primeiroNome ? `Olá, ${primeiroNome}!` : 'Olá!',
    '',
    `*A sua ${moto} está pronta* e pode ser retirada na ${nomeDaOficina}.`,
    '',
    `Ordem de serviço nº ${String(ordem.numero).padStart(4, '0')}`,
  ]

  if (ordem.moto) linhas.push(`Placa ${exibirPlaca(ordem.moto.placa)}`)
  linhas.push(`*Total: ${moeda(Number(ordem.valor_total))}*`)

  if (ordem.garantia_ate) {
    linhas.push('', `Garantia sobre os serviços até ${data(ordem.garantia_ate)}.`)
  }

  return linhas.join('\n')
}

/**
 * Endereço do WhatsApp com o texto já preenchido. Mesma regra do orçamento: o
 * wa.me exige o número internacional completo, e sem o 55 abre uma conversa
 * com um número errado.
 */
export function enderecoDoWhatsApp(texto: string, telefone: string | null): string {
  const codificado = encodeURIComponent(texto)
  const digitos = (telefone ?? '').replace(/\D/g, '')

  if (digitos.length === 10 || digitos.length === 11) {
    return `https://wa.me/55${digitos}?text=${codificado}`
  }
  if (digitos.length === 12 || digitos.length === 13) {
    return `https://wa.me/${digitos}?text=${codificado}`
  }
  return `https://wa.me/?text=${codificado}`
}
