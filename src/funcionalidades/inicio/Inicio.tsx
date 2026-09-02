import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Users, Bike, Package, Wrench, ClipboardList, UserPlus, TriangleAlert, FileText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Tela, CabecalhoTela, TituloSecao } from '@/componentes/layout/Tela'
import { EstadoVazio } from '@/componentes/ui/EstadoVazio'
import { useAuth } from '@/auth/ProvedorAuth'
import { usePermissoes } from '@/auth/usePermissoes'
import { primeiroNome } from '@/lib/formato'
import { produtosParaRepor } from '@/funcionalidades/estoque/api'

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

  // Contador de peça no fim: é o aviso que evita descobrir a falta com a moto
  // desmontada em cima da bancada.
  const repor = useQuery({
    queryKey: ['repor'],
    queryFn: produtosParaRepor,
    enabled: p.verCatalogo,
  })

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

  // Clientes saiu da tab bar, então ganha lugar garantido aqui: nunca fica a
  // mais de um toque de distância.
  const atalhos: Atalho[] = [
    { para: '/clientes', rotulo: 'Clientes', Icone: Users, visivel: p.verClientes },
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

      {/* Os dois caminhos que a oficina percorre o dia inteiro: chegou uma moto,
          ou vai sair um orçamento. Ficam no topo, com o maior alvo da tela. */}
      {p.editarOrcamentos && (
        <button
          type="button"
          onClick={() => navegar('/orcamentos/novo')}
          className="mb-3 flex w-full items-center gap-4 rounded-card bg-acento p-5 text-left active:bg-acento-pressionado"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-claro/10">
            <FileText aria-hidden size={26} className="text-claro" />
          </span>
          <span className="flex flex-col">
            <span className="text-secao text-claro">Novo orçamento</span>
            <span className="text-apoio text-claro/70">Monte e mande pelo WhatsApp.</span>
          </span>
        </button>
      )}

      <button
        type="button"
        onClick={() => navegar('/motos')}
        className="flex w-full items-center gap-4 rounded-card bg-superficie p-5 text-left shadow-card active:opacity-90"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-acento-suave">
          <Bike aria-hidden size={26} className="text-claro" />
        </span>
        <span className="flex flex-col">
          <span className="text-secao text-claro">Buscar moto pela placa</span>
          <span className="text-apoio text-claro-secundario">
            Chegou uma moto? Comece por aqui.
          </span>
        </span>
      </button>

      {repor.data && repor.data.length > 0 && (
        <button
          type="button"
          onClick={() => navegar('/catalogo?repor=1')}
          className="mt-3 flex w-full items-center gap-3 rounded-card bg-atencao-fundo p-4 text-left active:opacity-90"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-atencao/20 text-atencao">
            <TriangleAlert aria-hidden size={22} />
          </span>
          <span className="flex flex-col">
            <span className="text-secao text-claro">
              {repor.data.length} {repor.data.length === 1 ? 'produto' : 'produtos'} para repor
            </span>
            <span className="text-apoio text-claro-secundario">
              No mínimo ou abaixo. Toque para ver quais.
            </span>
          </span>
        </button>
      )}

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
