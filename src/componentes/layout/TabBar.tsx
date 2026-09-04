import { NavLink } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { usePermissoes } from '@/auth/usePermissoes'
import { cn } from '@/lib/cn'
import { ITENS } from './itensDeNavegacao'

/**
 * Barra fixa na base, no máximo 5 itens. Fica embaixo porque é onde o polegar
 * chega com o celular na mão, e respeita a safe area do iPhone para não ficar
 * escondida sob o indicador de início.
 *
 * Os itens vêm da mesma lista do menu lateral: aqui entram os marcados com
 * `naBarra`, mais o "Mais", que é a porta para o que não coube. Do tablet em
 * diante a barra some e o menu lateral mostra tudo de uma vez.
 */
export function TabBar() {
  const p = usePermissoes()

  const visiveis = [
    ...ITENS.filter((i) => i.naBarra && i.visivel(p)),
    { para: '/mais', rotulo: 'Mais', Icone: Menu },
  ]

  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-borda-escura bg-fundo/95 pb-seguro backdrop-blur',
        // Do tablet em diante quem navega é o menu lateral. A altura reservada
        // para esta barra também zera, em tokens.css.
        'tablet:hidden',
      )}
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
