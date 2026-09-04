import { NavLink } from 'react-router-dom'
import { Home, FileText, Bike, Wrench, Menu } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { usePermissoes } from '@/auth/usePermissoes'
import { cn } from '@/lib/cn'

interface Item {
  para: string
  rotulo: string
  Icone: LucideIcon
  visivel: boolean
}

/**
 * Barra fixa na base, no máximo 5 itens. Fica embaixo porque é onde o polegar
 * chega com o celular na mão, e respeita a safe area do iPhone para não ficar
 * escondida sob o indicador de início.
 */
export function TabBar() {
  const p = usePermissoes()

  // Cinco vagas, e orçamento é o que a oficina faz dez vezes por dia. Clientes
  // saiu da barra porque ninguém abre "Clientes" para olhar: chega-se ao cliente
  // pela moto que entrou ou digitando o nome dentro do orçamento, que é onde ele
  // é realmente necessário. O atalho continua na Início e em Mais.
  const itens: Item[] = [
    { para: '/', rotulo: 'Início', Icone: Home, visivel: true },
    { para: '/orcamentos', rotulo: 'Orçamentos', Icone: FileText, visivel: p.verOrcamentos },
    { para: '/motos', rotulo: 'Motos', Icone: Bike, visivel: p.verMotos },
    // Serviços entrou no lugar do Catálogo na Fase 3: a ordem de serviço é
    // aberta e consultada o dia inteiro, e o catálogo é cadastro — mexe-se nele
    // de vez em quando. O atalho do catálogo continua na Início e em Mais.
    { para: '/ordens', rotulo: 'Serviços', Icone: Wrench, visivel: p.verOrdensDaOficina },
    { para: '/mais', rotulo: 'Mais', Icone: Menu, visivel: true },
  ]

  const visiveis = itens.filter((i) => i.visivel)

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-borda-escura bg-fundo/95 pb-seguro backdrop-blur"
    >
      <ul className="mx-auto flex max-w-lg">
        {visiveis.map(({ para, rotulo, Icone }) => (
          <li key={para} className="flex-1">
            <NavLink
              to={para}
              end={para === '/'}
              className={({ isActive }) =>
                cn(
                  'flex h-tabbar flex-col items-center justify-center gap-1',
                  'transition-colors duration-padrao ease-padrao',
                  isActive ? 'text-acento' : 'text-escuro-secundario',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icone aria-hidden size={22} strokeWidth={isActive ? 2.4 : 2} />
                  <span className="text-micro">{rotulo}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
