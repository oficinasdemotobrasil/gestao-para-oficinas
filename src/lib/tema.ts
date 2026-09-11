/**
 * Claro, escuro, ou o que o aparelho pedir.
 *
 * A escolha fica no aparelho, e não na oficina: a mesma oficina tem o celular
 * do mecânico no bolso e o computador do balcão embaixo da luz. Guardar isso no
 * banco obrigaria os dois a concordarem, e eles não concordam.
 *
 * O escuro é o padrão da casa — é como o produto nasceu e é o que se lê melhor
 * na bancada, com a tela em pé o dia inteiro. "Automático" segue o aparelho.
 */
export type Tema = 'automatico' | 'claro' | 'escuro'

const CHAVE = 'tema'

export function temaEscolhido(): Tema {
  try {
    const guardado = localStorage.getItem(CHAVE)
    if (guardado === 'claro' || guardado === 'escuro') return guardado
  } catch {
    // Navegador sem armazenamento: segue o aparelho, que é o padrão mesmo.
  }
  return 'automatico'
}

/**
 * Marca a raiz do documento. O CSS faz o resto — nenhum componente sabe em que
 * tema está, o que é a razão de tudo isto caber em dois arquivos.
 */
export function aplicarTema(tema: Tema) {
  const raiz = document.documentElement
  if (tema === 'automatico') raiz.removeAttribute('data-tema')
  else raiz.setAttribute('data-tema', tema)

  try {
    if (tema === 'automatico') localStorage.removeItem(CHAVE)
    else localStorage.setItem(CHAVE, tema)
  } catch {
    /* sem armazenamento, vale só nesta sessão */
  }
}

/** O tema que está valendo agora, já resolvido o "automático". */
export function temaAtual(): 'claro' | 'escuro' {
  const escolhido = temaEscolhido()
  if (escolhido !== 'automatico') return escolhido
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'escuro'
}
