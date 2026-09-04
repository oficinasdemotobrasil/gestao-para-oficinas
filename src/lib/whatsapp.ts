/**
 * O endereço para abrir uma conversa no WhatsApp com o texto já escrito.
 *
 * Havia três cópias disto no app — orçamento, ordem de serviço e cobrança —, e
 * as três com a mesma regra do código do país. Agora é uma só: a próxima
 * correção acontece em um lugar.
 */

/**
 * O número no formato internacional que o WhatsApp exige.
 *
 * 10 ou 11 dígitos é número brasileiro sem o país; 12 ou 13 já vem com o 55.
 * Sem o código, o link abre uma conversa com um número errado — e quem descobre
 * é o cliente que recebe a mensagem de outra pessoa.
 */
function numeroInternacional(telefone: string | null): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '')
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`
  if (digitos.length === 12 || digitos.length === 13) return digitos
  return null
}

/**
 * No computador o link vai direto para o WhatsApp Web.
 *
 * O `wa.me` funciona nos dois, mas no computador ele para numa página
 * intermediária tentando abrir o aplicativo que não existe ali, e a pessoa tem
 * de clicar de novo. Com o balcão atendendo cliente, esse clique a mais é a
 * diferença entre mandar o orçamento e deixar para depois.
 *
 * A conta é ponteiro fino **e** tela grande: um tablet com caneta tem ponteiro
 * fino e o aplicativo instalado, e ali o wa.me é o caminho certo.
 */
function ehComputador(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.matchMedia('(pointer: fine)').matches && window.innerWidth >= 1024
  } catch {
    return false
  }
}

export function enderecoDoWhatsApp(texto: string, telefone: string | null): string {
  const codificado = encodeURIComponent(texto)
  const numero = numeroInternacional(telefone)

  if (ehComputador()) {
    // Sem número, o WhatsApp Web abre na conversa que estiver aberta e o texto
    // se perde — melhor cair no wa.me, que ao menos oferece escolher o contato.
    if (!numero) return `https://wa.me/?text=${codificado}`
    return `https://web.whatsapp.com/send?phone=${numero}&text=${codificado}`
  }

  // Sem telefone no cadastro, o wa.me abre o seletor de contato. É melhor do
  // que não abrir nada: cliente novo muitas vezes ainda não tem telefone salvo.
  if (!numero) return `https://wa.me/?text=${codificado}`
  return `https://wa.me/${numero}?text=${codificado}`
}
