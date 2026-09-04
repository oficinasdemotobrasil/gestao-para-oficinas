import { usePermissoes } from '@/auth/usePermissoes'
import { DetalheOrdemServico } from './DetalheOrdemServico'
import { OrdemDoMecanico } from './OrdemDoMecanico'

/**
 * A mesma rota, duas telas.
 *
 * Quem atende o cliente vê a ordem inteira, com valores e o que fazer com ela.
 * O mecânico vê a moto, o que fazer e o relógio — e é o banco que decide isso,
 * não este arquivo: para ele as tabelas com dinheiro estão fechadas, e a tela
 * de atendimento nem carregaria (migration 0033).
 *
 * Escolher aqui evita que ele veja um erro no lugar de uma tela.
 */
export function OrdemDeServico() {
  const p = usePermissoes()
  return p.ehMecanico ? <OrdemDoMecanico /> : <DetalheOrdemServico />
}
