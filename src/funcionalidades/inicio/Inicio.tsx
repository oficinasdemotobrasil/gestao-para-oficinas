import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Users, Bike, Package, Wrench, ClipboardList, UserPlus, TriangleAlert, FileText, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Tela, CabecalhoTela, TituloSecao } from '@/componentes/layout/Tela'
import { EstadoVazio } from '@/componentes/ui/EstadoVazio'
import { EsqueletoLista } from '@/componentes/ui/Carregando'
import { Card } from '@/componentes/ui/Card'
import { exibirPlaca, quilometragem } from '@/lib/formato'
import { useAuth } from '@/auth/ProvedorAuth'
import { usePermissoes } from '@/auth/usePermissoes'
import { primeiroNome } from '@/lib/formato'
import { produtosParaRepor } from '@/funcionalidades/estoque/api'
import { ordensDoMecanico } from '@/funcionalidades/ordens/apiDoMecanico'
import { StatusOsBadge } from '@/funcionalidades/ordens/StatusOsBadge'
import { Painel } from '@/funcionalidades/painel/Painel'

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
  // desmontada em cima da bancada. Com o painel na tela, ele já mostra o mesmo
  // número — então só aparece para quem não tem painel.
  const repor = useQuery({
    queryKey: ['repor'],
    queryFn: produtosParaRepor,
    enabled: p.verCatalogo && !p.verFinanceiro,
  })

  // Pela função do mecânico, que não passa por nenhuma tabela com dinheiro
  // (migration 0033). Ela já devolve só as dele e já vem ordenada: em andamento
  // primeiro, que é a ordem em que o dia dele acontece.
  const ordens = useQuery({
    queryKey: ['ordens-do-mecanico'],
    queryFn: ordensDoMecanico,
    enabled: p.ehMecanico,
  })

  // Para o mecânico, esta é a tela inteira: o que ele tem para fazer hoje.
  if (p.ehMecanico) {
    return (
      <Tela>
        <CabecalhoTela
          titulo={`Olá, ${primeiroNome(usuario?.nome)}!`}
          contexto={oficina?.nome}
        />

        {ordens.isPending ? (
          <EsqueletoLista linhas={3} />
        ) : ordens.data && ordens.data.length > 0 ? (
          <div className="flex flex-col gap-3">
            {ordens.data.map((os) => (
              <button
                key={os.id}
                type="button"
                onClick={() => navegar(`/ordens/${os.id}`)}
                className="text-left"
              >
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-corpo font-medium text-claro">
                        {os.placa ? exibirPlaca(os.placa) : 'Moto removida'}
                      </p>
                      <p className="truncate text-apoio text-claro-secundario">
                        {[os.marca, os.modelo].filter(Boolean).join(' ')}
                        {os.km_entrada ? ` · ${quilometragem(os.km_entrada)}` : ''}
                      </p>
                      <p className="truncate pt-2 text-apoio text-claro-secundario">
                        OS {String(os.numero).padStart(3, '0')} · {os.cliente_nome ?? '—'}
                      </p>
                    </div>
                    <StatusOsBadge status={os.status} />
                  </div>
                </Card>
              </button>
            ))}
          </div>
        ) : (
          <EstadoVazio
            icone={<ClipboardList aria-hidden size={28} />}
            titulo="Nenhuma ordem de serviço"
            descricao="Assim que o responsável atribuir um serviço a você, ele aparece aqui com a moto e o que precisa ser feito."
          />
        )}
      </Tela>
    )
  }

  // Clientes saiu da tab bar, então ganha lugar garantido aqui: nunca fica a
  // mais de um toque de distância.
  const atalhos: Atalho[] = [
    { para: '/clientes', rotulo: 'Clientes', Icone: Users, visivel: p.verClientes },
    { para: '/motos/nova', rotulo: 'Nova moto', Icone: Bike, visivel: p.editarMotos },
    { para: '/catalogo', rotulo: 'Catálogo', Icone: Package, visivel: p.verCatalogo },
    { para: '/financeiro', rotulo: 'Financeiro', Icone: Wallet, visivel: p.verFinanceiro },
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

      {!p.verFinanceiro && repor.data && repor.data.length > 0 && (
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

      {p.verFinanceiro && <Painel />}

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
