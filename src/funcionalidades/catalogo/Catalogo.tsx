import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Package, Wrench, Plus, TriangleAlert } from 'lucide-react'
import { Tela, CabecalhoTela } from '@/componentes/layout/Tela'
import { CampoBusca } from '@/componentes/ui/CampoBusca'
import { ListaCard, LinhaLista, IconeCirculo } from '@/componentes/ui/Card'
import { Botao } from '@/componentes/ui/Botao'
import { Badge } from '@/componentes/ui/Badge'
import { EstadoVazio, EstadoErro } from '@/componentes/ui/EstadoVazio'
import { EsqueletoLista } from '@/componentes/ui/Carregando'
import { useDebounce } from '@/lib/useDebounce'
import { moeda, quantidade } from '@/lib/formato'
import { cn } from '@/lib/cn'
import { usePermissoes } from '@/auth/usePermissoes'
import { listarProdutos } from '@/funcionalidades/produtos/api'
import { listarServicos } from '@/funcionalidades/servicos/api'

type Aba = 'produtos' | 'servicos'

/** Duas abas em vez de dois itens na tab bar: sobra espaço para o que importa. */
function Abas({ ativa, aoTrocar }: { ativa: Aba; aoTrocar: (a: Aba) => void }) {
  const abas: Array<{ id: Aba; rotulo: string }> = [
    { id: 'produtos', rotulo: 'Produtos' },
    { id: 'servicos', rotulo: 'Serviços' },
  ]

  return (
    <div role="tablist" className="flex gap-1 rounded-controle bg-superficie-escura p-1">
      {abas.map(({ id, rotulo }) => (
        <button
          key={id}
          role="tab"
          type="button"
          aria-selected={ativa === id}
          onClick={() => aoTrocar(id)}
          className={cn(
            'min-h-toque flex-1 rounded-[10px] text-corpo font-medium',
            'transition-colors duration-padrao ease-padrao',
            ativa === id ? 'bg-acento text-claro' : 'text-escuro-secundario',
          )}
        >
          {rotulo}
        </button>
      ))}
    </div>
  )
}

export function Catalogo() {
  const navegar = useNavigate()
  const p = usePermissoes()
  const [parametros, setParametros] = useSearchParams()
  const aba: Aba = parametros.get('aba') === 'servicos' ? 'servicos' : 'produtos'
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useDebounce(busca)

  const produtos = useQuery({
    queryKey: ['produtos', buscaAtrasada, p.verCusto],
    queryFn: () => listarProdutos(buscaAtrasada, p.verCusto),
    enabled: aba === 'produtos',
  })

  const servicos = useQuery({
    queryKey: ['servicos', buscaAtrasada],
    queryFn: () => listarServicos(buscaAtrasada),
    enabled: aba === 'servicos',
  })

  const consulta = aba === 'produtos' ? produtos : servicos
  const buscando = busca.trim().length > 0

  function trocarAba(nova: Aba) {
    setParametros(nova === 'produtos' ? {} : { aba: nova }, { replace: true })
    setBusca('')
  }

  return (
    <Tela>
      <CabecalhoTela
        titulo="Catálogo"
        contexto="Peças e serviços que a oficina oferece"
      />

      <div className="flex flex-col gap-3">
        <Abas ativa={aba} aoTrocar={trocarAba} />

        <CampoBusca
          rotulo={aba === 'produtos' ? 'Buscar produto' : 'Buscar serviço'}
          valor={busca}
          aoMudar={setBusca}
          placeholder={aba === 'produtos' ? 'Nome ou código' : 'Nome do serviço'}
        />

        {p.editarCatalogo && (
          <Botao
            largo
            icone={<Plus aria-hidden size={20} />}
            onClick={() => navegar(aba === 'produtos' ? '/catalogo/produtos/novo' : '/catalogo/servicos/novo')}
          >
            {aba === 'produtos' ? 'Novo produto' : 'Novo serviço'}
          </Botao>
        )}
      </div>

      <div className="pt-6">
        {consulta.isPending ? (
          <EsqueletoLista />
        ) : consulta.isError ? (
          <EstadoErro
            titulo="Não foi possível carregar o catálogo"
            descricao="Verifique a conexão e toque em tentar de novo."
            aoTentarDeNovo={() => void consulta.refetch()}
          />
        ) : aba === 'produtos' ? (
          !produtos.data || produtos.data.length === 0 ? (
            <EstadoVazio
              icone={<Package aria-hidden size={28} />}
              titulo={buscando ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado ainda'}
              descricao={
                buscando
                  ? `Nada com "${busca}". Confira a escrita ou cadastre o produto.`
                  : 'Cadastre as peças e os insumos que a oficina usa no dia a dia.'
              }
              rotuloAcao={p.editarCatalogo ? 'Cadastrar produto' : undefined}
              aoAgir={p.editarCatalogo ? () => navegar('/catalogo/produtos/novo') : undefined}
            />
          ) : (
            <ListaCard>
              {produtos.data.map((produto) => {
                const abaixoDoMinimo =
                  produto.estoque_minimo > 0 && produto.estoque_atual <= produto.estoque_minimo
                return (
                  <LinhaLista
                    key={produto.id}
                    inicio={
                      <IconeCirculo>
                        <Package aria-hidden size={20} />
                      </IconeCirculo>
                    }
                    titulo={produto.nome}
                    descricao={`${moeda(produto.preco_venda)} · ${quantidade(produto.estoque_atual)} ${produto.unidade}`}
                    // Badge só quando tem o que dizer. "Ativo" em quase toda
                    // linha não informa nada e rouba a largura do nome do
                    // produto, que é o que a pessoa procura.
                    fim={
                      !produto.ativo ? (
                        <Badge>Inativo</Badge>
                      ) : abaixoDoMinimo ? (
                        <Badge tom="atencao">
                          <span className="flex items-center gap-1">
                            <TriangleAlert aria-hidden size={13} />
                            Repor
                          </span>
                        </Badge>
                      ) : undefined
                    }
                    aoTocar={
                      p.editarCatalogo
                        ? () => navegar(`/catalogo/produtos/${produto.id}`)
                        : undefined
                    }
                  />
                )
              })}
            </ListaCard>
          )
        ) : !servicos.data || servicos.data.length === 0 ? (
          <EstadoVazio
            icone={<Wrench aria-hidden size={28} />}
            titulo={buscando ? 'Nenhum serviço encontrado' : 'Nenhum serviço cadastrado ainda'}
            descricao={
              buscando
                ? `Nada com "${busca}". Confira a escrita ou cadastre o serviço.`
                : 'Cadastre os serviços que a oficina executa, com preço e tempo estimado.'
            }
            rotuloAcao={p.editarCatalogo ? 'Cadastrar serviço' : undefined}
            aoAgir={p.editarCatalogo ? () => navegar('/catalogo/servicos/novo') : undefined}
          />
        ) : (
          <ListaCard>
            {servicos.data.map((servico) => (
              <LinhaLista
                key={servico.id}
                inicio={
                  <IconeCirculo>
                    <Wrench aria-hidden size={20} />
                  </IconeCirculo>
                }
                titulo={servico.nome}
                descricao={
                  servico.tempo_estimado_minutos
                    ? `${moeda(servico.preco)} · ${servico.tempo_estimado_minutos} min`
                    : moeda(servico.preco)
                }
                fim={servico.ativo ? undefined : <Badge>Inativo</Badge>}
                aoTocar={
                  p.editarCatalogo ? () => navegar(`/catalogo/servicos/${servico.id}`) : undefined
                }
              />
            ))}
          </ListaCard>
        )}
      </div>
    </Tela>
  )
}
