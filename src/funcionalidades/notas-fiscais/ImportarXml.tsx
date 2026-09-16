import { useCallback, useRef, useState } from 'react'
import { FileUp, Link2, Plus, Package } from 'lucide-react'
import { Botao } from '@/componentes/ui/Botao'
import { FolhaDeBusca, type OpcaoDeBusca } from '@/componentes/ui/FolhaDeBusca'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { moeda, quantidade as formatarQuantidade } from '@/lib/formato'
import { usePermissoes } from '@/auth/usePermissoes'
import { listarProdutos, criarProduto } from '@/funcionalidades/produtos/api'
import { lerXmlDaNota, XmlInvalido, type ItemDoXml, type NotaDoXml } from './lerXmlDaNota'
import { produtosPorCodigo, type ItemEntradaEmEdicao } from './api'

const novaChave = () => Math.random().toString(36).slice(2)

interface Props {
  /** Recebe o cabeçalho lido e os itens que já casaram com o catálogo. */
  aoImportar: (nota: NotaDoXml, itens: ItemEntradaEmEdicao[]) => void
  /** Acrescenta um item depois que a pessoa resolveu a ligação dele. */
  aoResolverItem: (item: ItemEntradaEmEdicao) => void
}

/**
 * Importa a nota a partir do XML que o fornecedor mandou.
 *
 * O arquivo é lido no próprio aparelho — nada é enviado para lugar nenhum.
 * Ele traz tudo: fornecedor, cada peça, quantidade, custo, NCM, CFOP e
 * impostos. O que sobra para a pessoa digitar é a parte financeira, que o
 * XML não tem como saber: em quantas vezes, quando vence, como pagou.
 *
 * A parte que não dá para automatizar honestamente é ligar cada peça do
 * fornecedor à peça do catálogo da oficina. O código do XML é o código do
 * FORNECEDOR: casa sozinho só se a oficina já tiver anotado esse código no
 * produto dela. Para o resto, a tela pergunta — e cadastrar a peça nova já
 * vem preenchido com o que o XML informou, então é um toque.
 */
export function ImportarXml({ aoImportar, aoResolverItem }: Props) {
  const toast = useToast()
  const p = usePermissoes()
  const entrada = useRef<HTMLInputElement>(null)
  const [pendentes, setPendentes] = useState<ItemDoXml[]>([])
  const [ligando, setLigando] = useState<ItemDoXml | null>(null)
  const [criando, setCriando] = useState<string | null>(null)

  async function aoEscolherArquivo(arquivo: File) {
    try {
      const nota = lerXmlDaNota(await arquivo.text())

      const mapa = await produtosPorCodigo(nota.itens.map((i) => i.codigo))
      const prontos: ItemEntradaEmEdicao[] = []
      const faltando: ItemDoXml[] = []

      for (const item of nota.itens) {
        const encontrado = mapa.get(item.codigo.trim())
        if (encontrado) {
          prontos.push({
            chave: novaChave(),
            produto_id: encontrado.id,
            produto_nome: encontrado.nome,
            quantidade: item.quantidade,
            custo_unitario: item.valorUnitario,
          })
        } else {
          faltando.push(item)
        }
      }

      aoImportar(nota, prontos)
      setPendentes(faltando)

      if (faltando.length === 0) {
        toast.sucesso(
          `Nota importada: ${nota.itens.length} ${nota.itens.length === 1 ? 'peça' : 'peças'}. Falta só o financeiro.`,
        )
      } else {
        toast.sucesso(
          `Nota importada. ${faltando.length} ${faltando.length === 1 ? 'peça precisa' : 'peças precisam'} ser ligada ao seu catálogo.`,
        )
      }
    } catch (e) {
      toast.erro(e instanceof XmlInvalido ? e.message : traduzirErro(e))
    }
  }

  const buscarProdutos = useCallback(
    async (termo: string): Promise<OpcaoDeBusca[]> => {
      const lista = await listarProdutos(termo, p.verCusto)
      return lista.map((x) => ({
        id: `${x.id}|${x.nome}`,
        titulo: x.nome,
        descricao: `${x.estoque_atual} ${x.unidade} em estoque`,
      }))
    },
    [p.verCusto],
  )

  function resolver(item: ItemDoXml, produtoId: string, produtoNome: string) {
    aoResolverItem({
      chave: novaChave(),
      produto_id: produtoId,
      produto_nome: produtoNome,
      quantidade: item.quantidade,
      custo_unitario: item.valorUnitario,
    })
    setPendentes((atuais) => atuais.filter((x) => x !== item))
    setLigando(null)
  }

  async function cadastrarDoXml(item: ItemDoXml) {
    setCriando(item.codigo)
    try {
      const novo = await criarProduto({
        // O código do fornecedor vai junto: é ele que faz a próxima nota
        // deste mesmo fornecedor casar sozinha, sem perguntar de novo.
        codigo: item.codigo || null,
        nome: item.descricao,
        ncm: item.ncm,
        descricao: null,
        unidade: item.unidade,
        preco_custo: item.valorUnitario,
        // Preço de venda fica em zero de propósito: inventar margem seria
        // decidir o preço da oficina por ela. A peça aparece no catálogo
        // esperando o preço.
        preco_venda: 0,
        // O estoque entra pela nota, não pelo cadastro — senão a peça entraria
        // duas vezes.
        estoque_atual: 0,
        estoque_minimo: 0,
        ativo: true,
      })
      resolver(item, novo.id, novo.nome)
      toast.sucesso(`"${item.descricao}" cadastrada. Defina o preço de venda depois, no Catálogo.`)
    } catch (e) {
      toast.erro(traduzirErro(e))
    } finally {
      setCriando(null)
    }
  }

  return (
    <>
      <input
        ref={entrada}
        type="file"
        accept=".xml,text/xml,application/xml"
        className="hidden"
        onChange={(e) => {
          const arquivo = e.target.files?.[0]
          if (arquivo) void aoEscolherArquivo(arquivo)
          // Zera para a mesma nota poder ser escolhida de novo se der erro.
          e.target.value = ''
        }}
      />

      <button
        type="button"
        onClick={() => entrada.current?.click()}
        className="flex min-h-toque items-center justify-center gap-2 rounded-card bg-acento px-4 text-em-superficie active:opacity-80"
      >
        <FileUp aria-hidden size={20} />
        <span className="text-corpo font-semibold">Importar XML da nota</span>
      </button>

      {pendentes.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 rounded-card border border-atencao bg-superficie p-5 shadow-card">
          <div>
            <p className="text-corpo font-semibold text-em-superficie">
              {pendentes.length} {pendentes.length === 1 ? 'peça da nota não está' : 'peças da nota não estão'} no seu catálogo
            </p>
            <p className="pt-1 text-apoio text-em-superficie-2">
              Ligue cada uma a uma peça que já existe, ou cadastre com os dados da própria nota.
              Depois disso, notas deste fornecedor casam sozinhas.
            </p>
          </div>

          {pendentes.map((item) => (
            <div key={item.codigo + item.descricao} className="rounded-controle bg-fundo-2 p-4">
              <p className="text-corpo font-medium text-em-fundo">{item.descricao}</p>
              <p className="pt-0.5 text-apoio text-em-fundo-2">
                Código do fornecedor: {item.codigo || '—'}
                {item.ncm ? ` · NCM ${item.ncm}` : ''}
              </p>
              <p className="pt-0.5 text-apoio text-em-fundo-2">
                {formatarQuantidade(item.quantidade)} {item.unidade} × {moeda(item.valorUnitario)} ={' '}
                {moeda(item.valorTotal)}
              </p>

              <div className="flex flex-wrap gap-2 pt-3">
                <Botao
                  variante="contorno"
                  icone={<Link2 aria-hidden size={18} />}
                  onClick={() => setLigando(item)}
                >
                  Ligar a uma peça
                </Botao>
                <Botao
                  icone={<Plus aria-hidden size={18} />}
                  carregando={criando === item.codigo}
                  onClick={() => void cadastrarDoXml(item)}
                >
                  Cadastrar esta
                </Botao>
              </div>
            </div>
          ))}
        </div>
      )}

      <FolhaDeBusca
        aberto={ligando !== null}
        aoFechar={() => setLigando(null)}
        titulo="Ligar a qual peça?"
        placeholder="Nome ou código"
        buscar={buscarProdutos}
        aoEscolher={(chaveComposta) => {
          const [id, nome] = chaveComposta.split('|')
          if (ligando) resolver(ligando, id, nome)
        }}
        vazio={{
          titulo: 'Nenhuma peça no catálogo',
          descricao: 'Use "Cadastrar esta" para criar a peça com os dados da nota.',
        }}
      />

      {pendentes.length === 0 && (
        <p className="flex items-center gap-1.5 pt-2 text-apoio text-em-fundo-2">
          <Package aria-hidden size={14} />O arquivo é lido no seu aparelho — nada é enviado pela rede.
        </p>
      )}
    </>
  )
}
