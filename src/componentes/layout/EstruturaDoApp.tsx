import { Outlet } from 'react-router-dom'
import { TabBar } from './TabBar'
import { MenuLateral } from './MenuLateral'
import { AvisoOffline } from './AvisoOffline'

/**
 * A casca das telas logadas, e o único lugar que decide como se navega.
 *
 * Até 767px: barra de abas fixa embaixo, onde o polegar chega.
 * De 768px em diante: menu lateral fixo à esquerda, e a barra some.
 *
 * As duas navegações leem a mesma lista (itensDeNavegacao.ts) e a troca
 * acontece só aqui. Nenhuma tela sabe em qual tamanho está — se soubesse,
 * cada uma teria a sua opinião, e a décima discordaria das nove.
 *
 * O deslocamento do conteúdo é padding e não margem: assim o fundo continua
 * cobrindo a tela inteira, e nada "descola" do lado esquerdo quando a página
 * rola.
 */
export function EstruturaDoApp() {
  return (
    <div className="min-h-dvh bg-fundo">
      <AvisoOffline />
      <MenuLateral />

      <div className="tablet:pl-menu-estreito desktop:pl-menu">
        <Outlet />
      </div>

      <TabBar />
    </div>
  )
}
