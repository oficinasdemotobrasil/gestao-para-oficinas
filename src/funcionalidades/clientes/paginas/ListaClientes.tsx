import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Users, Plus, Phone } from 'lucide-react'
import { Tela, CabecalhoTela } from '@/componentes/layout/Tela'
import { CampoBusca } from '@/componentes/ui/CampoBusca'
import { ListaCard, LinhaLista, IconeCirculo } from '@/componentes/ui/Card'
import { Botao } from '@/componentes/ui/Botao'
import { EstadoVazio, EstadoErro } from '@/componentes/ui/EstadoVazio'
import { EsqueletoLista } from '@/componentes/ui/Carregando'
import { useDebounce } from '@/lib/useDebounce'
import { telefone as formatarTelefone } from '@/lib/formato'
import { usePermissoes } from '@/auth/usePermissoes'
import { listarClientes } from '../api'

export function ListaClientes() {
  const navegar = useNavigate()
  const p = usePermissoes()
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useDebounce(busca)

  const { data: clientes, isPending, isError, refetch } = useQuery({
    queryKey: ['clientes', buscaAtrasada],
    queryFn: () => listarClientes(buscaAtrasada),
  })

  const buscando = busca.trim().length > 0

  return (
    <Tela>
      <CabecalhoTela
        titulo="Clientes"
        contexto={
          clientes ? `${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'}` : undefined
        }
      />

      <div className="flex flex-col gap-3">
        <CampoBusca
          rotulo="Buscar cliente por nome ou telefone"
          valor={busca}
          aoMudar={setBusca}
          placeholder="Nome ou telefone"
        />

        {p.editarClientes && (
          <Botao largo icone={<Plus aria-hidden size={20} />} onClick={() => navegar('/clientes/novo')}>
            Novo cliente
          </Botao>
        )}
      </div>

      <div className="pt-6">
        {isPending ? (
          <EsqueletoLista />
        ) : isError ? (
          <EstadoErro
            titulo="Não foi possível carregar os clientes"
            descricao="Verifique a conexão e toque em tentar de novo."
            aoTentarDeNovo={() => void refetch()}
          />
        ) : clientes.length === 0 ? (
          <EstadoVazio
            icone={<Users aria-hidden size={28} />}
            titulo={buscando ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado ainda'}
            descricao={
              buscando
                ? `Não achamos ninguém com "${busca}". Confira a escrita ou cadastre o cliente.`
                : 'Cadastre o primeiro cliente para começar a registrar motos e serviços.'
            }
            rotuloAcao={p.editarClientes ? 'Cadastrar cliente' : undefined}
            aoAgir={p.editarClientes ? () => navegar('/clientes/novo') : undefined}
          />
        ) : (
          <ListaCard>
            {clientes.map((cliente) => (
              <LinhaLista
                key={cliente.id}
                inicio={
                  <IconeCirculo>
                    <span className="text-corpo font-semibold">
                      {cliente.nome.trim().charAt(0).toUpperCase()}
                    </span>
                  </IconeCirculo>
                }
                titulo={cliente.nome}
                descricao={cliente.telefone ? formatarTelefone(cliente.telefone) : 'Sem telefone'}
                aoTocar={() => navegar(`/clientes/${cliente.id}`)}
              />
            ))}
          </ListaCard>
        )}
      </div>

      {clientes && clientes.length >= 100 && (
        <p className="flex items-start gap-2 px-1 pt-4 text-apoio text-escuro-secundario">
          <Phone aria-hidden size={16} className="mt-0.5 shrink-0" />
          Mostrando os 100 primeiros. Use a busca para encontrar alguém específico.
        </p>
      )}
    </Tela>
  )
}
