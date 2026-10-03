import type { Combustivel } from '@/tipos/banco'

/**
 * Os itens da vistoria de entrada, na ordem em que se olha a moto: de fora
 * para dentro, de cima para baixo.
 *
 * As chaves vão para o banco (os_vistorias.itens) e não mudam — trocar uma
 * chave apagaria a marcação das vistorias antigas. O rótulo pode mudar à
 * vontade. Item novo entra no fim da lista, sem migração.
 */
export const ITENS_DA_VISTORIA: { chave: string; rotulo: string }[] = [
  { chave: 'riscos', rotulo: 'Pintura e carenagem (riscos, amassados)' },
  { chave: 'retrovisores', rotulo: 'Retrovisores' },
  { chave: 'farol_piscas', rotulo: 'Farol, lanterna e piscas' },
  { chave: 'painel', rotulo: 'Painel' },
  { chave: 'banco', rotulo: 'Banco' },
  { chave: 'pneus', rotulo: 'Pneus' },
  { chave: 'escapamento', rotulo: 'Escapamento' },
]

export const NIVEIS_DE_COMBUSTIVEL: { valor: Combustivel; rotulo: string }[] = [
  { valor: 'reserva', rotulo: 'Reserva' },
  { valor: '1/4', rotulo: '1/4' },
  { valor: '1/2', rotulo: '1/2' },
  { valor: '3/4', rotulo: '3/4' },
  { valor: 'cheio', rotulo: 'Cheio' },
]
