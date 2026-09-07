/**
 * A marca da oficina aplicada no app.
 *
 * A cor entra trocando três variáveis de CSS em tempo de execução. Não existe
 * folha de estilo por cliente: o Tailwind daqui já lê tudo de variável, então
 * trocar o valor no elemento raiz repinta o app inteiro de uma vez.
 *
 * O que muda é só o destaque — botão principal, item ativo do menu, número em
 * evidência. Fundo, cartões e texto continuam iguais para todo mundo, porque
 * são eles que garantem a legibilidade que a cor da marca não pode estragar.
 */
import { COR_DO_PRODUTO, ehHexadecimal, tonsDoAcento } from './cor'

const CHAVE = 'marca-da-ultima-oficina'

export function aplicarCorDaMarca(cor: string | null | undefined) {
  const escolhida = cor && ehHexadecimal(cor) ? cor.toLowerCase() : COR_DO_PRODUTO
  const raiz = document.documentElement

  // Quem não escolheu cor nenhuma fica exatamente como sempre foi.
  //
  // Isto não é detalhe: os três tons do amarelo do produto foram escolhidos a
  // mão no DESIGN.md, e a derivação automática chega perto mas não igual — o
  // tom suave, por exemplo, sairia #f2edd9 em vez de #fdf3cc, mudando a cor de
  // toda etiqueta do app. Apagar a propriedade devolve o valor do tokens.css.
  if (escolhida === COR_DO_PRODUTO) {
    raiz.style.removeProperty('--cor-acento')
    raiz.style.removeProperty('--cor-acento-pressionado')
    raiz.style.removeProperty('--cor-acento-suave')
    return
  }

  const tons = tonsDoAcento(escolhida)
  raiz.style.setProperty('--cor-acento', tons.acento)
  raiz.style.setProperty('--cor-acento-pressionado', tons.pressionado)
  raiz.style.setProperty('--cor-acento-suave', tons.suave)
}

/**
 * O que o aparelho lembra da última oficina que entrou nele.
 *
 * A tela de entrar não sabe de qual oficina se trata — o app tem um endereço
 * só, e quem digita ainda não disse quem é. Saber isso exigiria um endereço
 * por oficina, que está fora do escopo. Então o aparelho guarda a marca de
 * quem entrou da última vez: no computador do balcão, que é onde isso importa,
 * a segunda entrada em diante já aparece com a cara da oficina.
 */
export type MarcaLembrada = {
  nome: string
  cor: string
  logoMiniatura: string | null
}

export function lembrarMarca(marca: MarcaLembrada) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(marca))
  } catch {
    // Navegador sem armazenamento (janela anônima, por exemplo). A tela de
    // entrar aparece com a cara do produto, e nada mais acontece.
  }
}

export function marcaLembrada(): MarcaLembrada | null {
  try {
    const bruto = localStorage.getItem(CHAVE)
    if (!bruto) return null
    const lido = JSON.parse(bruto) as Partial<MarcaLembrada>
    if (typeof lido.nome !== 'string' || !ehHexadecimal(lido.cor ?? '')) return null
    return {
      nome: lido.nome,
      cor: (lido.cor as string).toLowerCase(),
      logoMiniatura: typeof lido.logoMiniatura === 'string' ? lido.logoMiniatura : null,
    }
  } catch {
    return null
  }
}

export function esquecerMarca() {
  try {
    localStorage.removeItem(CHAVE)
  } catch {
    /* nada a fazer */
  }
}
