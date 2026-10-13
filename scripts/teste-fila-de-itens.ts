/**
 * A fila que grava os itens da OS (src/funcionalidades/ordens/filaDeItens.ts).
 *
 * Roda a fila de verdade contra um banco de mentira, com demora em cada ida e
 * volta — é a demora que fazia o defeito da OS 025 (13/10/2026) aparecer:
 * digitar 800 no preço gravava 8, 80 e 800 ao mesmo tempo, e o 80 ficava.
 *
 * Prova:
 * - digitar rápido grava uma vez só, com o valor final;
 * - digitar devagar nunca deixa duas gravações correndo juntas;
 * - item novo editado antes de a tela recarregar entra uma vez só;
 * - sair da tela no meio da espera grava na hora;
 * - depois de um erro, a mudança seguinte ainda entra;
 * - o aviso de "gravando" liga no primeiro toque e desliga no fim.
 *
 * Não toca em banco nenhum: npm run teste:fila-de-itens.
 */
import { criarFilaDeItens, type ItemDaFila } from '../src/funcionalidades/ordens/filaDeItens'

let passou = 0
let falhou = 0
function confere(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passou++
    console.log(`  \x1b[32m✓\x1b[0m ${nome}`)
  } else {
    falhou++
    console.log(`  \x1b[31m✗\x1b[0m ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
  }
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Linha {
  id: string
  descricao: string
  quantidade: number
  valor_unitario: number
}

/** Um banco de mentira com a mesma diferença que `sincronizarItensDaOs` aplica. */
function bancoFalso(demoraMs: number, inicial: Linha[] = []) {
  const linhas = new Map(inicial.map((l) => [l.id, { ...l }]))
  let proximo = 1
  let correndo = 0
  let maximoJunto = 0
  let gravacoes = 0
  let falharProxima = false

  async function ida<T>(f: () => T): Promise<T> {
    correndo++
    maximoJunto = Math.max(maximoJunto, correndo)
    await dormir(demoraMs)
    correndo--
    return f()
  }

  return {
    linhas,
    get maximoJunto() {
      return maximoJunto
    },
    get gravacoes() {
      return gravacoes
    },
    falharNaProxima() {
      falharProxima = true
    },
    itensNoBanco: (_ordem: string) => ida(() => [...linhas.values()].map((l) => ({ ...l }))),
    sincronizar: (_ordem: string, noBanco: Linha[], alvo: ItemDaFila[]) =>
      ida(() => {
        gravacoes++
        if (falharProxima) {
          falharProxima = false
          throw new Error('sem internet')
        }
        const porChave = new Map(alvo.map((i) => [i.chave, i]))
        for (const antigo of noBanco) {
          const atual = porChave.get(antigo.id)
          if (!atual) linhas.delete(antigo.id)
          else linhas.set(antigo.id, { ...antigo, quantidade: atual.quantidade, valor_unitario: atual.valor_unitario })
        }
        const existentes = new Set(noBanco.map((l) => l.id))
        const inseridos = new Map<string, string>()
        for (const item of alvo) {
          if (existentes.has(item.chave)) continue
          const id = `id-${proximo++}`
          linhas.set(id, { id, descricao: item.descricao, quantidade: item.quantidade, valor_unitario: item.valor_unitario })
          inseridos.set(item.chave, id)
        }
        return inseridos
      }),
  }
}

function filaCom(banco: ReturnType<typeof bancoFalso>, esperaMs: number) {
  const ocupada: boolean[] = []
  const erros: unknown[] = []
  const fila = criarFilaDeItens<Linha>({
    banco,
    esperaMs,
    aoMudarOcupada: (o) => ocupada.push(o),
    aoTerminar: () => undefined,
    aoErrar: (e) => erros.push(e),
  })
  return { fila, ocupada, erros }
}

const item = (chave: string, descricao: string, quantidade: number, valor_unitario: number): ItemDaFila => ({
  chave,
  tipo: 'avulso',
  produto_id: null,
  servico_id: null,
  descricao,
  quantidade,
  valor_unitario,
})

async function esperarFila(fila: { ocupada: () => boolean }) {
  while (fila.ocupada()) await dormir(5)
}

async function main() {
  console.log('\n\x1b[1mA fila que grava os itens da OS\x1b[0m')

  {
    // Digitar 800 rápido: três teclas antes de a espera acabar.
    const banco = bancoFalso(30, [{ id: 'balancins', descricao: 'Balancins', quantidade: 1, valor_unitario: 800 }])
    const { fila, ocupada } = filaCom(banco, 100)
    for (const preco of [8, 80, 800]) {
      fila.mudar('os-25', [item('balancins', 'Balancins', 1, preco)])
      await dormir(20)
    }
    await esperarFila(fila)
    confere('digitar rápido grava uma vez só', banco.gravacoes === 1, `${banco.gravacoes} gravações`)
    confere('e com o valor final (800, não 80)', banco.linhas.get('balancins')?.valor_unitario === 800)
    confere('"gravando" liga no primeiro toque e desliga no fim', ocupada[0] === true && ocupada.at(-1) === false)
  }

  {
    // Digitar devagar com internet lenta: as gravações se cruzariam.
    const banco = bancoFalso(150, [{ id: 'balancins', descricao: 'Balancins', quantidade: 1, valor_unitario: 800 }])
    const { fila } = filaCom(banco, 40)
    for (const preco of [8, 80, 800]) {
      fila.mudar('os-25', [item('balancins', 'Balancins', 1, preco)])
      await dormir(60)
    }
    await esperarFila(fila)
    confere('com internet lenta, nunca duas gravações ao mesmo tempo', banco.maximoJunto === 1, `${banco.maximoJunto} juntas`)
    confere('e o banco termina com o que está na tela (800)', banco.linhas.get('balancins')?.valor_unitario === 800)
  }

  {
    // Item novo, e logo em seguida a quantidade dele muda — a tela ainda o
    // conhece pela chave provisória.
    const banco = bancoFalso(80)
    const { fila } = filaCom(banco, 20)
    fila.mudar('os-1', [item('provisoria', 'Lâmpada H7', 1, 50)])
    await dormir(60)
    fila.mudar('os-1', [item('provisoria', 'Lâmpada H7', 2, 50)])
    await esperarFila(fila)
    const lampadas = [...banco.linhas.values()].filter((l) => l.descricao === 'Lâmpada H7')
    confere('item novo editado antes de a tela recarregar entra uma vez só', lampadas.length === 1, `${lampadas.length} linhas`)
    confere('com a quantidade nova', lampadas[0]?.quantidade === 2)

    fila.mudar('os-1', [])
    await esperarFila(fila)
    confere('e tirar o item da lista apaga ele do banco', banco.linhas.size === 0)
  }

  {
    // Saiu da tela no meio da espera.
    const banco = bancoFalso(10, [{ id: 'oleo', descricao: 'Óleo', quantidade: 4, valor_unitario: 90 }])
    const { fila } = filaCom(banco, 10_000)
    fila.mudar('os-1', [item('oleo', 'Óleo', 3, 90)])
    await fila.gravarJa()
    await esperarFila(fila)
    confere('sair da tela no meio da espera grava na hora', banco.linhas.get('oleo')?.quantidade === 3)
  }

  {
    // A primeira gravação falha; a pessoa mexe de novo.
    const banco = bancoFalso(20, [{ id: 'oleo', descricao: 'Óleo', quantidade: 4, valor_unitario: 90 }])
    const { fila, erros, ocupada } = filaCom(banco, 10)
    banco.falharNaProxima()
    fila.mudar('os-1', [item('oleo', 'Óleo', 5, 90)])
    await esperarFila(fila)
    confere('o erro chega para a tela avisar', erros.length === 1)
    fila.mudar('os-1', [item('oleo', 'Óleo', 6, 90)])
    await esperarFila(fila)
    confere('e a mudança seguinte entra', banco.linhas.get('oleo')?.quantidade === 6)
    confere('sem ficar preso em "gravando"', ocupada.at(-1) === false)
  }

  console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
  process.exit(falhou === 0 ? 0 : 1)
}

void main()
