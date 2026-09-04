import { Home, FileText, Wrench, Bike, Users, Package, Wallet, Users2, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { usePermissoes } from '@/auth/usePermissoes'

type Permissoes = ReturnType<typeof usePermissoes>

export interface ItemDeNavegacao {
  para: string
  rotulo: string
  Icone: LucideIcon
  visivel: (p: Permissoes) => boolean
  /**
   * Aparece na barra de abas do celular, que tem cinco vagas contando o "Mais".
   * O que não cabe ali continua alcançável pelo "Mais" — e no menu lateral, que
   * não tem esse limite, aparece tudo.
   */
  naBarra?: boolean
}

/**
 * A navegação do app inteiro, em um lugar só.
 *
 * A barra de abas do celular e o menu lateral do desktop leem desta lista. Duas
 * listas separadas divergiriam no primeiro item novo — e o jeito de descobrir
 * seria alguém não achar uma tela.
 */
export const ITENS: ItemDeNavegacao[] = [
  { para: '/', rotulo: 'Início', Icone: Home, visivel: () => true, naBarra: true },
  { para: '/orcamentos', rotulo: 'Orçamentos', Icone: FileText, visivel: (p) => p.verOrcamentos, naBarra: true },
  // A ordem aqui é a ordem na tela, e ela não muda por capricho: na oficina se
  // toca por posição, não por leitura. Motos antes de Serviços porque era assim
  // antes de esta lista existir.
  { para: '/motos', rotulo: 'Motos', Icone: Bike, visivel: (p) => p.verMotos, naBarra: true },
  { para: '/ordens', rotulo: 'Serviços', Icone: Wrench, visivel: (p) => p.verOrdensDaOficina, naBarra: true },
  // Clientes ficou fora da barra do celular porque ninguém abre "Clientes" para
  // olhar: chega-se ao cliente pela moto que entrou ou digitando o nome dentro
  // do orçamento. No menu lateral, que não disputa espaço, ele aparece.
  { para: '/clientes', rotulo: 'Clientes', Icone: Users, visivel: (p) => p.verClientes },
  { para: '/catalogo', rotulo: 'Catálogo', Icone: Package, visivel: (p) => p.verCatalogo },
  { para: '/financeiro', rotulo: 'Financeiro', Icone: Wallet, visivel: (p) => p.verFinanceiro },
  { para: '/colaboradores', rotulo: 'Colaboradores', Icone: Users2, visivel: (p) => p.verColaboradores },
  { para: '/configuracoes', rotulo: 'Configurações', Icone: Settings, visivel: (p) => p.verConfiguracoes },
]
