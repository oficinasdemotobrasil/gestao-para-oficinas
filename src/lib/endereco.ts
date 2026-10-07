/**
 * O endereço oficial do GIRO e a mudança do antigo para ele (07/10/2026).
 *
 * O app nasceu em gestao-para-oficinas.vercel.app e passou para
 * usegiromotos.com. O endereço antigo continua no ar — é o mesmo site — e manda
 * cada pessoa para o novo, mantendo a página em que ela estava.
 *
 * Mas só manda quem já ALCANÇA o novo. Logo depois da troca de DNS, parte da
 * internet ainda guarda o endereço velho do domínio (o DNS do Google guardou
 * por horas); um redirecionamento cego, feito pelo servidor, jogaria essa
 * gente num endereço que não abre para ela. Aqui o app pergunta antes: um
 * arquivo do site novo responde? Respondeu, vai; não respondeu em 4 segundos,
 * fica no antigo, que funciona igual, e tenta de novo na próxima abertura.
 *
 * Roda no começo do app, e não no meio do uso: ninguém é tirado de uma ordem
 * de serviço pela metade. O login fica guardado por endereço, então quem muda
 * entra de novo uma vez — e a tela de entrar explica por quê.
 */

export const ENDERECO_OFICIAL = 'https://usegiromotos.com'
const ENDERECOS_ANTIGOS = ['gestao-para-oficinas.vercel.app']
const MARCA_DA_MUDANCA = 'veio'
const CHAVE_DA_MUDANCA = 'giro-veio-do-endereco-antigo'

/** No endereço antigo, vai para o oficial se ele já abre nesta internet. */
function irParaOOficial() {
  const controle = new AbortController()
  const prazo = setTimeout(() => controle.abort(), 4000)
  // `no-cors`: não precisamos ler a resposta, só saber se ela chega. Chegar
  // inclui o certificado válido do domínio novo — o servidor velho não tem.
  fetch(`${ENDERECO_OFICIAL}/favicon.svg?alcance=${Date.now()}`, {
    mode: 'no-cors',
    cache: 'no-store',
    signal: controle.signal,
  })
    .then(() => {
      const destino = new URL(location.pathname + location.search + location.hash, ENDERECO_OFICIAL)
      destino.searchParams.set(MARCA_DA_MUDANCA, 'antigo')
      location.replace(destino.toString())
    })
    .catch(() => {
      // Esta internet ainda não conhece o endereço novo: segue no antigo.
    })
    .finally(() => clearTimeout(prazo))
}

/**
 * No endereço oficial, chegando do antigo: guarda que veio de lá (para a tela
 * de entrar explicar) e tira a marca do endereço, que não é da conta de ninguém.
 */
function registrarChegada() {
  const url = new URL(location.href)
  if (url.searchParams.get(MARCA_DA_MUDANCA) !== 'antigo') return
  try {
    sessionStorage.setItem(CHAVE_DA_MUDANCA, '1')
  } catch {
    // Sem armazenamento, só não aparece o aviso.
  }
  url.searchParams.delete(MARCA_DA_MUDANCA)
  history.replaceState(history.state, '', url.pathname + url.search + url.hash)
}

export function cuidarDaMudancaDeEndereco() {
  if (ENDERECOS_ANTIGOS.includes(location.hostname)) irParaOOficial()
  else registrarChegada()
}

/** Chegou agora do endereço antigo? (Para o aviso na tela de entrar.) */
export function veioDoEnderecoAntigo(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_DA_MUDANCA) === '1'
  } catch {
    return false
  }
}
