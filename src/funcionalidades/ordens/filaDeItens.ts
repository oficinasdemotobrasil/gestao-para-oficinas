/**
 * A fila que grava os itens da OS enquanto a pessoa edita (13/10/2026).
 *
 * Antes, cada tecla no preço disparava uma gravação, todas ao mesmo tempo, e
 * cada uma comparava com uma lista já velha. Na OS 025 o "80" do meio do
 * caminho para "800" ficou gravado, e a tela e a lista passaram a mostrar
 * valores diferentes.
 *
 * Aqui: espera a pessoa parar de mexer, grava uma lista por vez, e cada
 * gravação compara com o que está no banco NAQUELE momento. Sem React, para o
 * teste (npm run teste:fila-de-itens) poder rodar a fila de verdade.
 */

/** O mínimo que a fila precisa saber de um item (é o `ItemEmEdicao` da tela). */
export interface ItemDaFila {
  chave: string
  tipo: 'produto' | 'servico' | 'avulso'
  produto_id: string | null
  servico_id: string | null
  descricao: string
  quantidade: number
  valor_unitario: number
}

export interface BancoDaFila<Linha> {
  itensNoBanco(ordemId: string): Promise<Linha[]>
  /** Aplica a diferença e devolve, para cada item novo, chave provisória → id. */
  sincronizar(ordemId: string, noBanco: Linha[], alvo: ItemDaFila[]): Promise<Map<string, string>>
}

export interface OpcoesDaFila<Linha> {
  banco: BancoDaFila<Linha>
  esperaMs: number
  /** Liga ao primeiro toque e desliga quando não há mais nada por gravar. */
  aoMudarOcupada: (ocupada: boolean) => void
  /** Ao fim de cada rodada: hora de a tela buscar o que ficou no banco. */
  aoTerminar: () => void
  aoErrar: (e: unknown) => void
}

type ListaDaOrdem = { ordemId: string; itens: ItemDaFila[] }

export function criarFilaDeItens<Linha>(o: OpcoesDaFila<Linha>) {
  let ultimo: ListaDaOrdem | null = null
  let alvo: ListaDaOrdem | null = null
  let agendada: ReturnType<typeof setTimeout> | undefined
  let rodando = false
  // O id com que cada item novo entrou: a gravação seguinte não o insere de
  // novo enquanto a tela ainda o conhece pela chave provisória.
  const ids = new Map<string, string>()

  async function rodar() {
    if (rodando) return
    rodando = true
    try {
      while (alvo) {
        const { ordemId, itens } = alvo
        alvo = null
        const lista = itens.map((i) => ({ ...i, chave: ids.get(i.chave) ?? i.chave }))
        const noBanco = await o.banco.itensNoBanco(ordemId)
        const inseridos = await o.banco.sincronizar(ordemId, noBanco, lista)
        inseridos.forEach((id, chave) => ids.set(chave, id))
      }
    } catch (e) {
      // Esta lista não entrou. Se a pessoa já mexeu de novo, a próxima rodada
      // tenta com a mudança nova; se não, a tela volta ao que está no banco.
      alvo = null
      o.aoErrar(e)
    } finally {
      rodando = false
      if (!ocupada()) o.aoMudarOcupada(false)
      o.aoTerminar()
    }
  }

  function ocupada() {
    return rodando || agendada !== undefined || alvo !== null
  }

  /** Grava o que estiver esperando, sem esperar mais. */
  function gravarJa(): Promise<void> {
    clearTimeout(agendada)
    agendada = undefined
    if (!ultimo) return Promise.resolve()
    alvo = ultimo
    ultimo = null
    return rodar()
  }

  function mudar(ordemId: string, itens: ItemDaFila[]) {
    ultimo = { ordemId, itens }
    clearTimeout(agendada)
    agendada = setTimeout(() => void gravarJa(), o.esperaMs)
    o.aoMudarOcupada(true)
  }

  return { mudar, gravarJa, ocupada }
}
