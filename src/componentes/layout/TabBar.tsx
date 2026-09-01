import { NavLink } from 'react-router-dom'
import { Home, Users, Bike, Package, Menu } from 'lucide-react'
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

  const itens: Item[] = [
    { para: '/', rotulo: 'Início', Icone: Home, visivel: true },
    { para: '/clientes', rotulo: 'Clientes', Icone: Users, visivel: p.verClientes },
    { para: '/motos', rotulo: 'Motos', Icone: Bike, visivel: p.verMotos },
    { para: '/catalogo', rotulo: 'Catálogo', Icone: Package, visivel: p.verCatalogo },
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
