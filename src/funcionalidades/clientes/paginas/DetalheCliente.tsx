import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bike, Pencil, Plus } from 'lucide-react'
import { Tela, CabecalhoInterno, TituloSecao } from '@/componentes/layout/Tela'
import { Card, ListaCard, LinhaLista, IconeCirculo } from '@/componentes/ui/Card'
import { Botao } from '@/componentes/ui/Botao'
import { Carregando } from '@/componentes/ui/Carregando'
import { EstadoErro } from '@/componentes/ui/EstadoVazio'
import { telefone, cpfCnpj, exibirPlaca, quilometragem, data } from '@/lib/formato'
import { usePermissoes } from '@/auth/usePermissoes'
import { obterCliente, motosDoCliente } from '../api'

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-rotulo text-claro-secundario">{rotulo}</span>
      <span className="text-corpo text-claro">{valor}</span>
    </div>
  )
}

export function DetalheCliente() {
  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()
  const p = usePermissoes()

  const { data: cliente, isPending, isError, refetch } = useQuery({
    queryKey: ['cliente', id],
    queryFn: () => obterCliente(id!),
  })

  const { data: motos } = useQuery({
    queryKey: ['cliente', id, 'motos'],
    queryFn: () => motosDoCliente(id!),
    enabled: Boolean(cliente),
  })

  if (isPending) return <Carregando />
  if (isError) return <EstadoErro aoTentarDeNovo={() => void refetch()} />
  if (!cliente) {
    return (
      <EstadoErro
        titulo="Cliente não encontrado"
        descricao="Ele pode ter sido removido. Volte para a lista de clientes."
        aoTentarDeNovo={() => navegar('/clientes', { replace: true })}
      />
    )
  }

  return (
    <Tela>
      <CabecalhoInterno
        titulo={cliente.nome}
        contexto={`Cliente desde ${data(cliente.criado_em)}`}
        acao={
          p.editarClientes ? (
            <Botao
              variante="contorno"
              className="h-toque px-4"
              icone={<Pencil aria-hidden size={18} />}
              onClick={() => navegar(`/clientes/${cliente.id}/editar`)}
            >
              Editar
            </Botao>
          ) : undefined
        }
      />

      <Card>
        <Linha rotulo="Telefone" valor={telefone(cliente.telefone)} />
        <Linha rotulo="E-mail" valor={cliente.email ?? '—'} />
        <Linha rotulo="CPF / CNPJ" valor={cpfCnpj(cliente.cpf_cnpj)} />
      </Card>

      {cliente.observacoes && (
        <>
          <TituloSecao>Observações</TituloSecao>
          <Card>
            <p className="whitespace-pre-line text-corpo text-claro">{cliente.observacoes}</p>
          </Card>
        </>
      )}

      <TituloSecao
        acao={
          p.editarMotos ? (
            <Botao
              variante="texto"
              icone={<Plus aria-hidden size={18} />}
              onClick={() => navegar(`/motos/nova?cliente=${cliente.id}`)}
            >
              Adicionar
            </Botao>
          ) : undefined
        }
      >
        Motos
      </TituloSecao>

      {!motos || motos.length === 0 ? (
        <Card escuro>
          <p className="text-corpo text-escuro-secundario">
            Nenhuma moto vinculada a este cliente ainda.
          </p>
        </Card>
      ) : (
        <ListaCard>
          {motos.map((moto) => (
            <LinhaLista
              key={moto.id}
              inicio={
                <IconeCirculo>
                  <Bike aria-hidden size={20} />
                </IconeCirculo>
              }
              titulo={exibirPlaca(moto.placa)}
              descricao={
                [moto.marca, moto.modelo].filter(Boolean).join(' ') ||
                quilometragem(moto.km_atual)
              }
              aoTocar={() => navegar(`/motos/${moto.id}`)}
            />
          ))}
        </ListaCard>
      )}
    </Tela>
  )
}
