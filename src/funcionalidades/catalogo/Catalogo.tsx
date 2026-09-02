import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Package, Wrench, Plus, TriangleAlert, X } from 'lucide-react'
import { Tela, CabecalhoTela } from '@/componentes/layout/Tela'
import { CampoBusca } from '@/componentes/ui/CampoBusca'
import { Abas } from '@/componentes/ui/Abas'
import { ListaCard, LinhaLista, IconeCirculo } from '@/componentes/ui/Card'
import { Botao } from '@/componentes/ui/Botao'
import { Badge } from '@/componentes/ui/Badge'
import { EstadoVazio, EstadoErro } from '@/componentes/ui/EstadoVazio'
import { EsqueletoLista } from '@/componentes/ui/Carregando'
import { useDebounce } from '@/lib/useDebounce'
import { moeda, quantidade } from '@/lib/formato'
import { usePermissoes } from '@/auth/usePermissoes'
import { listarProdutos } from '@/funcionalidades/produtos/api'
import { listarServicos } from '@/funcionalidades/servicos/api'
import { Estoque } from '@/funcionalidades/estoque/paginas/Estoque'

type Aba = 'produtos' | 'servicos' | 'estoque'

const abas = [
  { id: 'produtos', rotulo: 'Produtos' },
  { id: 'servicos', rotulo: 'Serviços' },
  { id: 'estoque', rotulo: 'Estoque' },
] as const

export function Catalogo() {
  const navegar = useNavigate()
  const p = usePermissoes()
  const [parametros, setParametros] = useSearchParams()

  const aba: Aba =
    parametros.get('aba') === 'servicos'
      ? 'servicos'
      : parametros.get('aba') === 'estoque'
        ? 'estoque'
        : 'produtos'

  // Chegou pelo aviso de "produtos para repor": a lista abre já filtrada.
  const soParaRepor = parametros.get('repor') === '1'

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

  function trocarAba(nova: Aba) {
    setParametros(nova === 'produtos' ? {} : { aba: nova }, { replace: true })
    setBusca('')
  }

  const listaProdutos = (produtos.data ?? []).filter((produto) => {
    if (!soParaRepor) return true
    const minimo = Number(produto.estoque_minimo)
    return minimo > 0 && Number(produto.estoque_atual) <= minimo
  })

  const buscando = busca.trim().length > 0

  return (
    <Tela>
      <CabecalhoTela titulo="Catálogo" contexto="Peças, serviços e o estoque da oficina" />

      <div className="flex flex-col gap-3">
        <Abas rotulo="Seções do catálogo" abas={abas} ativa={aba} aoTrocar={trocarAba} />

        {aba !== 'estoque' && (
          <>
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
                onClick={() =>
                  navegar(
                    aba === 'produtos' ? '/catalogo/produtos/novo' : '/catalogo/servicos/novo',
                  )
                }
              >
                {aba === 'produtos' ? 'Novo produto' : 'Novo serviço'}
              </Botao>
            )}
          </>
        )}
      </div>

      {aba === 'estoque' ? (
        <div className="pt-3">
          <Estoque />
        </div>
      ) : (
        <div className="pt-6">
          {aba === 'produtos' ? (
            <>
              {soParaRepor && (
                <button
                  type="button"
                  onClick={() => setParametros({}, { replace: true })}
                  className="mb-3 flex min-h-toque w-full items-center justify-between gap-3 rounded-controle bg-atencao-fundo px-4 text-left"
                >
                  <span className="text-corpo font-medium text-claro">
                    Mostrando só o que precisa repor
                  </span>
                  <X aria-hidden size={18} className="shrink-0 text-claro-secundario" />
                </button>
              )}

              {produtos.isPending ? (
                <EsqueletoLista />
              ) : produtos.isError ? (
                <EstadoErro
                  titulo="Não foi possível carregar o catálogo"
                  descricao="Verifique a conexão e toque em tentar de novo."
                  aoTentarDeNovo={() => void produtos.refetch()}
                />
              ) : listaProdutos.length === 0 ? (
                <EstadoVazio
                  icone={<Package aria-hidden size={28} />}
                  titulo={
                    soParaRepor
                      ? 'Nenhum produto para repor'
                      : buscando
                        ? 'Nenhum produto encontrado'
                        : 'Nenhum produto cadastrado ainda'
                  }
                  descricao={
                    soParaRepor
                      ? 'Todo o estoque está acima do mínimo. Bom sinal.'
                      : buscando
                        ? `Nada com "${busca}". Confira a escrita ou cadastre o produto.`
                        : 'Cadastre as peças e os insumos que a oficina usa no dia a dia.'
                  }
                  rotuloAcao={p.editarCatalogo && !soParaRepor ? 'Cadastrar produto' : undefined}
                  aoAgir={
                    p.editarCatalogo && !soParaRepor
                      ? () => navegar('/catalogo/produtos/novo')
                      : undefined
                  }
                />
              ) : (
                <ListaCard>
                  {listaProdutos.map((produto) => {
                    const minimo = Number(produto.estoque_minimo)
                    const abaixoDoMinimo = minimo > 0 && Number(produto.estoque_atual) <= minimo
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
                        // linha não informa nada e rouba a largura do nome.
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
                        aoTocar={() => navegar(`/catalogo/produtos/${produto.id}`)}
                      />
                    )
                  })}
                </ListaCard>
              )}
            </>
          ) : servicos.isPending ? (
            <EsqueletoLista />
          ) : servicos.isError ? (
            <EstadoErro
              titulo="Não foi possível carregar os serviços"
              descricao="Verifique a conexão e toque em tentar de novo."
              aoTentarDeNovo={() => void servicos.refetch()}
            />
          ) : servicos.data.length === 0 ? (
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
      )}
    </Tela>
  )
}
