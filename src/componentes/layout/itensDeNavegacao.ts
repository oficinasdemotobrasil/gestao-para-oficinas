import { Home, FileText, Wrench, Bike, Users, Package, Wallet, Receipt, Users2, Settings, Search, Handshake, BookOpen } from 'lucide-react'
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
  // A busca do balcão fica fora da barra do celular porque lá ela já é o
  // primeiro cartão da tela inicial, com um alvo bem maior que um ícone. No
  // menu lateral, que não disputa espaço, ela aparece.
  { para: '/buscar', rotulo: 'Buscar', Icone: Search, visivel: (p) => p.verMotos },
  // Clientes ficou fora da barra do celular porque ninguém abre "Clientes" para
  // olhar: chega-se ao cliente pela moto que entrou ou digitando o nome dentro
  // do orçamento. No menu lateral, que não disputa espaço, ele aparece.
  { para: '/clientes', rotulo: 'Clientes', Icone: Users, visivel: (p) => p.verClientes },
  { para: '/catalogo', rotulo: 'Catálogo', Icone: Package, visivel: (p) => p.verCatalogo },
  { para: '/financeiro', rotulo: 'Financeiro', Icone: Wallet, visivel: (p) => p.verFinanceiro },
  // Notas fiscais segue a mesma regra do Financeiro (perfil E plano): conversa
  // direto com Contas a Pagar e a Receber. Uma entrada só, com entrada e saída
  // em abas dentro dela. Fora da barra do celular — as cinco vagas já estão
  // tomadas — e alcançada pelo "Mais".
  { para: '/notas-fiscais', rotulo: 'Notas fiscais', Icone: Receipt, visivel: (p) => p.verFinanceiro },
  { para: '/indicadores', rotulo: 'Indicadores', Icone: Handshake, visivel: (p) => p.ehAdmin },
  { para: '/colaboradores', rotulo: 'Colaboradores', Icone: Users2, visivel: (p) => p.verColaboradores },
  // A ajuda fica por último de propósito: quem precisa dela procura, e quem
  // não precisa não tropeça nela todo dia.
  { para: '/ajuda', rotulo: 'Ajuda', Icone: BookOpen, visivel: () => true },
  { para: '/configuracoes', rotulo: 'Configurações', Icone: Settings, visivel: (p) => p.verConfiguracoes },
]
