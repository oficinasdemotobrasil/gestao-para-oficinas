import { z } from 'zod'
import { campoNumerico } from '@/lib/numero'

const opcional = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()

export const esquemaProduto = z.object({
  nome: z.string().trim().min(2, 'Informe o nome do produto.').max(120, 'Nome muito longo.'),
  codigo: opcional,
  descricao: opcional,
  unidade: z.string().trim().min(1, 'Informe a unidade.').default('un'),
  preco_custo: campoNumerico('Informe o preço de custo.'),
  preco_venda: campoNumerico('Informe o preço de venda.'),
  estoque_atual: campoNumerico('Informe o estoque atual.'),
  estoque_minimo: campoNumerico('Informe o estoque mínimo.'),
  ativo: z.boolean(),
})

export type DadosFormularioProduto = z.input<typeof esquemaProduto>
/** O que sai do Zod, já convertido — é isto que chega no onSubmit. */
export type DadosProdutoValidados = z.output<typeof esquemaProduto>
