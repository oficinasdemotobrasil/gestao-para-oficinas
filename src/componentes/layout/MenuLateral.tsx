import { NavLink } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/auth/ProvedorAuth'
import { usePermissoes, nomeDoPerfil } from '@/auth/usePermissoes'
import { cn } from '@/lib/cn'
import { ITENS } from './itensDeNavegacao'

/**
 * A navegação do tablet para cima.
 *
 * No celular a barra de abas cabe cinco itens e o resto vai para o "Mais". Aqui
 * não há esse limite, então tudo aparece de uma vez — que é o ganho de ter uma
 * tela grande: menos toques para chegar ao mesmo lugar.
 *
 * No tablet ele fica estreito, só com o ícone e o rótulo pequeno embaixo; do
 * desktop em diante abre com ícone e nome lado a lado.
 */
export function MenuLateral() {
  const { usuario, oficina, sair } = useAuth()
  const p = usePermissoes()
  const itens = ITENS.filter((i) => i.visivel(p))

  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-borda-escura bg-fundo',
        'tablet:flex tablet:w-menu-estreito desktop:w-menu',
      )}
    >
      {/* Quem é a oficina. No tablet estreito só cabe a inicial. */}
      <div className="flex items-center gap-3 border-b border-borda-escura px-4 py-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-controle bg-acento text-secao font-bold text-claro">
          {(oficina?.nome ?? 'O').trim().charAt(0).toUpperCase()}
        </span>
        <span className="hidden min-w-0 desktop:block">
          <span className="block truncate text-corpo font-semibold text-escuro">
            {oficina?.nome ?? 'Sua oficina'}
          </span>
        </span>
      </div>

      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto p-2 desktop:p-3">
        {itens.map(({ para, rotulo, Icone }) => (
          <li key={para}>
            <NavLink
              to={para}
              end={para === '/'}
              title={rotulo}
              className={({ isActive }) =>
                cn(
                  'flex items-center rounded-controle transition-colors duration-padrao ease-padrao',
                  'tablet:flex-col tablet:gap-1 tablet:px-1 tablet:py-2.5',
                  'desktop:flex-row desktop:gap-3 desktop:px-3 desktop:py-2.5',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
                  isActive
                    ? 'bg-acento text-claro'
                    : 'text-escuro-secundario hover:bg-superficie-escura hover:text-escuro',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icone aria-hidden size={22} strokeWidth={isActive ? 2.4 : 2} />
                  {/* Rede de segurança: se um item novo tiver nome comprido, ele
                      corta em vez de vazar por cima da borda do menu. */}
                  <span className="w-full truncate text-center text-micro tablet:block desktop:hidden">
                    {rotulo}
                  </span>
                  <span className="hidden truncate text-corpo desktop:block">{rotulo}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      {/* Quem está logado e a saída, no pé — onde se procura por eles. */}
      <div className="border-t border-borda-escura p-3">
        <div className="hidden px-1 pb-2 desktop:block">
          <p className="truncate text-corpo text-escuro">{usuario?.nome}</p>
          <p className="truncate text-apoio text-escuro-secundario">
            {usuario ? nomeDoPerfil[usuario.perfil] : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void sair()}
          className={cn(
            'flex w-full items-center rounded-controle text-escuro-secundario',
            'transition-colors duration-padrao ease-padrao hover:bg-superficie-escura hover:text-erro',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
            'tablet:flex-col tablet:gap-1 tablet:px-1 tablet:py-2.5',
            'desktop:flex-row desktop:gap-3 desktop:px-3 desktop:py-2.5',
          )}
        >
          <LogOut aria-hidden size={20} />
          <span className="text-micro tablet:block desktop:hidden">Sair</span>
          <span className="hidden text-corpo desktop:block">Sair</span>
        </button>
      </div>
    </nav>
  )
}
