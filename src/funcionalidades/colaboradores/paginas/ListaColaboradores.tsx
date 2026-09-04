import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Users2, Plus, ShieldCheck, Store, Wrench } from 'lucide-react'
import { Tela, CabecalhoInterno } from '@/componentes/layout/Tela'
import { LinhaLista, IconeCirculo } from '@/componentes/ui/Card'
import { ListaResponsiva } from '@/componentes/ui/ListaResponsiva'
import { Botao } from '@/componentes/ui/Botao'
import { BadgeAtivo } from '@/componentes/ui/Badge'
import { EstadoVazio, EstadoErro } from '@/componentes/ui/EstadoVazio'
import { EsqueletoLista } from '@/componentes/ui/Carregando'
import { useAuth } from '@/auth/ProvedorAuth'
import { nomeDoPerfil } from '@/auth/usePermissoes'
import { listarColaboradores } from '../api'

const iconePorPerfil = {
  admin: ShieldCheck,
  vendedor: Store,
  mecanico: Wrench,
} as const

export function ListaColaboradores() {
  const navegar = useNavigate()
  const { usuario } = useAuth()

  const { data: colaboradores, isPending, isError, refetch } = useQuery({
    queryKey: ['colaboradores'],
    queryFn: listarColaboradores,
  })

  const ativos = colaboradores?.filter((c) => c.ativo).length ?? 0

  return (
    <Tela>
      <CabecalhoInterno
        titulo="Colaboradores"
        contexto={colaboradores ? `${ativos} com acesso ativo` : undefined}
      />

      <Botao largo icone={<Plus aria-hidden size={20} />} onClick={() => navegar('/colaboradores/novo')}>
        Novo colaborador
      </Botao>

      <div className="pt-6">
        {isPending ? (
          <EsqueletoLista linhas={3} />
        ) : isError ? (
          <EstadoErro
            titulo="Não foi possível carregar a equipe"
            descricao="Verifique a conexão e toque em tentar de novo."
            aoTentarDeNovo={() => void refetch()}
          />
        ) : colaboradores.length === 0 ? (
          <EstadoVazio
            icone={<Users2 aria-hidden size={28} />}
            titulo="Nenhum colaborador ainda"
            descricao="Cadastre quem trabalha na oficina e defina o que cada um pode ver."
            rotuloAcao="Cadastrar colaborador"
            aoAgir={() => navegar('/colaboradores/novo')}
          />
        ) : (
          <ListaResponsiva
            descricao="Equipe da oficina"
            itens={colaboradores}
            chaveDoItem={(c) => c.id}
            aoTocar={(c) => navegar(`/colaboradores/${c.id}`)}
            cartao={(colaborador) => {
              const Icone = iconePorPerfil[colaborador.perfil]
              const souEu = colaborador.id === usuario?.id
              return (
                <LinhaLista
                  inicio={
                    <IconeCirculo>
                      <Icone aria-hidden size={20} />
                    </IconeCirculo>
                  }
                  titulo={souEu ? `${colaborador.nome} (você)` : colaborador.nome}
                  descricao={`${nomeDoPerfil[colaborador.perfil]} · ${colaborador.email}`}
                  fim={<BadgeAtivo ativo={colaborador.ativo} />}
                  aoTocar={() => navegar(`/colaboradores/${colaborador.id}`)}
                />
              )
            }}
            colunas={[
              {
                chave: 'nome',
                titulo: 'Nome',
                celula: (c) => (
                  <span className="font-medium">
                    {c.id === usuario?.id ? `${c.nome} (você)` : c.nome}
                  </span>
                ),
              },
              {
                chave: 'perfil',
                titulo: 'Perfil',
                largura: 'w-44',
                celula: (c) => nomeDoPerfil[c.perfil],
              },
              { chave: 'email', titulo: 'E-mail', peso: 'apoio', celula: (c) => c.email },
              {
                chave: 'ativo',
                titulo: 'Situação',
                largura: 'w-32',
                celula: (c) => <BadgeAtivo ativo={c.ativo} />,
              },
            ]}
          />
        )}
      </div>

      <p className="px-1 pt-6 text-apoio text-escuro-secundario">
        O mecânico enxerga somente as ordens de serviço atribuídas a ele. O
        vendedor cuida de clientes, motos e catálogo, mas não vê preço de custo
        nem financeiro.
      </p>
    </Tela>
  )
}
