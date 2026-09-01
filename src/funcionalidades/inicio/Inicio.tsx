import { useNavigate } from 'react-router-dom'
import { Users, Bike, Package, Wrench, ClipboardList, UserPlus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Tela, CabecalhoTela, TituloSecao } from '@/componentes/layout/Tela'
import { EstadoVazio } from '@/componentes/ui/EstadoVazio'
import { useAuth } from '@/auth/ProvedorAuth'
import { usePermissoes } from '@/auth/usePermissoes'
import { primeiroNome } from '@/lib/formato'

interface Atalho {
  para: string
  rotulo: string
  Icone: LucideIcon
  visivel: boolean
}

export function Inicio() {
  const { usuario, oficina } = useAuth()
  const p = usePermissoes()
  const navegar = useNavigate()

  // O mecânico só enxerga as ordens atribuídas a ele — e ordem de serviço é
  // assunto da Fase 2. Até lá esta é a tela inteira dele, o que é o correto,
  // e não uma configuração faltando.
  if (p.ehMecanico) {
    return (
      <Tela>
        <CabecalhoTela
          titulo={`Olá, ${primeiroNome(usuario?.nome)}!`}
          contexto={oficina?.nome}
        />
        <EstadoVazio
          icone={<ClipboardList aria-hidden size={28} />}
          titulo="Nenhuma ordem de serviço"
          descricao="Assim que o responsável atribuir um serviço a você, ele aparece aqui com a moto e o que precisa ser feito."
        />
      </Tela>
    )
  }

  const atalhos: Atalho[] = [
    { para: '/clientes/novo', rotulo: 'Novo cliente', Icone: Users, visivel: p.editarClientes },
    { para: '/motos/nova', rotulo: 'Nova moto', Icone: Bike, visivel: p.editarMotos },
    { para: '/catalogo', rotulo: 'Catálogo', Icone: Package, visivel: p.verCatalogo },
    {
      para: '/colaboradores',
      rotulo: 'Colaboradores',
      Icone: UserPlus,
      visivel: p.verColaboradores,
    },
  ]

  return (
    <Tela>
      <CabecalhoTela
        titulo={`Olá, ${primeiroNome(usuario?.nome)}!`}
        contexto={oficina?.nome ?? 'Sua oficina'}
      />

      {/* Busca por placa é o caminho mais usado do dia: chega a moto, digita a
          placa, abre o histórico. Fica no topo, com alvo grande. */}
      <button
        type="button"
        onClick={() => navegar('/motos')}
        className="flex w-full items-center gap-4 rounded-card bg-acento p-5 text-left active:bg-acento-pressionado"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-claro/10">
          <Bike aria-hidden size={26} className="text-claro" />
        </span>
        <span className="flex flex-col">
          <span className="text-secao text-claro">Buscar moto pela placa</span>
          <span className="text-apoio text-claro/70">
            Chegou uma moto? Comece por aqui.
          </span>
        </span>
      </button>

      <TituloSecao>Atalhos</TituloSecao>

      <div className="grid grid-cols-2 gap-3">
        {atalhos
          .filter((a) => a.visivel)
          .map(({ para, rotulo, Icone }) => (
            <button
              key={para}
              type="button"
              onClick={() => navegar(para)}
              className="flex min-h-[104px] flex-col items-start justify-between rounded-card bg-superficie p-5 text-left shadow-card active:opacity-90"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-acento-suave">
                <Icone aria-hidden size={20} className="text-claro" />
              </span>
              <span className="text-corpo font-medium text-claro">{rotulo}</span>
            </button>
          ))}
      </div>

      <p className="flex items-start gap-2 px-1 pt-8 text-apoio text-escuro-secundario">
        <Wrench aria-hidden size={16} className="mt-0.5 shrink-0" />
        Os números do movimento — serviços do dia, faturamento e motos na
        oficina — chegam na Fase 3.
      </p>
    </Tela>
  )
}
