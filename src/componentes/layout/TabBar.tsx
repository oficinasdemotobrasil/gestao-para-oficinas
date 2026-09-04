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
        // Fundo OPACO, e sem desfoque.
        //
        // Era 'bg-fundo/95 backdrop-blur': 5% de transparência parecia pouco,
        // mas com um card branco rolando atrás o branco atravessava e lavava a
        // barra inteira — os rótulos cinza sumiam contra o fundo clareado, e
        // sobrava um borrão. Numa oficina, com sol na tela e o celular na mão
        // suja, isso é a diferença entre achar e não achar o botão.
        //
        // Barra de navegação não é enfeite de vidro: ela precisa estar sempre
        // legível, e o único jeito de garantir isso é não deixar o conteúdo
        // aparecer por baixo.
        'fixed inset-x-0 bottom-0 z-40 border-t border-borda-escura bg-fundo pb-seguro',
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
                  // O inativo continua no cinza secundário: contra o fundo
                  // opaco ele dá 7:1 de contraste, acima do exigido até para
                  // texto pequeno. Deixá-lo branco resolveria a leitura e
                  // criaria outro problema — cinco itens brancos e um amarelo
                  // param de dizer onde a pessoa está.
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
