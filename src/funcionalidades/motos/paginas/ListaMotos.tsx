import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bike, Plus } from 'lucide-react'
import { Tela, CabecalhoTela } from '@/componentes/layout/Tela'
import { CampoBusca } from '@/componentes/ui/CampoBusca'
import { Filtros } from '@/componentes/ui/Filtros'
import { LinhaLista } from '@/componentes/ui/Card'
import { ListaResponsiva } from '@/componentes/ui/ListaResponsiva'
import { Botao } from '@/componentes/ui/Botao'
import { EstadoVazio, EstadoErro } from '@/componentes/ui/EstadoVazio'
import { EsqueletoLista } from '@/componentes/ui/Carregando'
import { useDebounce } from '@/lib/useDebounce'
import { exibirPlaca, quilometragem } from '@/lib/formato'
import { usePermissoes } from '@/auth/usePermissoes'
import { listarMotos } from '../api'

/** A placa é o que identifica a moto, então ela ocupa o lugar de destaque. */
function Placa({ placa }: { placa: string }) {
  return (
    <span className="flex h-10 min-w-[86px] items-center justify-center rounded-badge bg-acento px-2 text-rotulo font-semibold tracking-wide text-claro">
      {exibirPlaca(placa)}
    </span>
  )
}

export function ListaMotos() {
  const navegar = useNavigate()
  const p = usePermissoes()
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useDebounce(busca)

  const { data: motos, isPending, isError, refetch } = useQuery({
    queryKey: ['motos', buscaAtrasada],
    queryFn: () => listarMotos(buscaAtrasada),
  })

  const buscando = busca.trim().length > 0

  return (
    <Tela>
      <CabecalhoTela
        titulo="Motos"
        contexto="Busque pela placa para abrir o histórico"
      />

      <Filtros
        busca={
          // Teclado em maiúscula: placa se digita assim, e economiza um toque.
          <CampoBusca
            rotulo="Buscar moto pela placa"
            valor={busca}
            aoMudar={setBusca}
            placeholder="ABC1D23"
            autoCapitalize="characters"
            inputMode="text"
          />
        }
        acoes={
          p.editarMotos ? (
            <Botao
              largo
              compactoNoDesktop
              icone={<Plus aria-hidden size={20} />}
              onClick={() => navegar('/motos/nova')}
            >
              Nova moto
            </Botao>
          ) : undefined
        }
      />

      <div className="pt-6">
        {isPending ? (
          <EsqueletoLista />
        ) : isError ? (
          <EstadoErro
            titulo="Não foi possível carregar as motos"
            descricao="Verifique a conexão e toque em tentar de novo."
            aoTentarDeNovo={() => void refetch()}
          />
        ) : motos.length === 0 ? (
          <EstadoVazio
            icone={<Bike aria-hidden size={28} />}
            titulo={buscando ? 'Nenhuma moto encontrada' : 'Nenhuma moto cadastrada ainda'}
            descricao={
              buscando
                ? `Nenhuma placa parecida com "${busca.toUpperCase()}". Confira os caracteres ou cadastre a moto.`
                : 'Cadastre a primeira moto para começar a guardar o histórico dela.'
            }
            rotuloAcao={p.editarMotos ? 'Cadastrar moto' : undefined}
            aoAgir={p.editarMotos ? () => navegar('/motos/nova') : undefined}
          />
        ) : (
          <ListaResponsiva
            descricao="Motos atendidas pela oficina"
            itens={motos}
            chaveDoItem={(m) => m.id}
            aoTocar={(m) => navegar(`/motos/${m.id}`)}
            cartao={(moto) => (
              <LinhaLista
                inicio={<Placa placa={moto.placa} />}
                titulo={[moto.marca, moto.modelo].filter(Boolean).join(' ') || 'Moto sem modelo'}
                descricao={quilometragem(moto.km_atual)}
                aoTocar={() => navegar(`/motos/${moto.id}`)}
              />
            )}
            colunas={[
              {
                chave: 'placa',
                titulo: 'Placa',
                largura: 'w-40',
                celula: (m) => <Placa placa={m.placa} />,
              },
              {
                chave: 'modelo',
                titulo: 'Moto',
                celula: (m) => (
                  <span className="font-medium">
                    {[m.marca, m.modelo].filter(Boolean).join(' ') || 'Moto sem modelo'}
                  </span>
                ),
              },
              {
                chave: 'km',
                titulo: 'Quilometragem',
                alinhar: 'direita',
                largura: 'w-48',
                celula: (m) => quilometragem(m.km_atual),
              },
            ]}
          />
        )}
      </div>
    </Tela>
  )
}
