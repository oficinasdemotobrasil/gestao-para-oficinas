import { z } from 'zod'

/** Campo opcional de texto: vazio vira null, para não gravar string em branco. */
const opcional = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()

export const esquemaCliente = z.object({
  nome: z
    .string()
    .trim()
    .min(2, 'Informe o nome do cliente.')
    .max(120, 'Nome muito longo.'),
  telefone: opcional.refine(
    (v) => v === null || v.replace(/\D/g, '').length >= 10,
    'Telefone incompleto. Inclua o DDD.',
  ),
  email: opcional.refine(
    (v) => v === null || z.string().email().safeParse(v).success,
    'E-mail inválido. Confira se não faltou o @.',
  ),
  cpf_cnpj: opcional.refine(
    (v) => {
      if (v === null) return true
      const d = v.replace(/\D/g, '')
      return d.length === 11 || d.length === 14
    },
    'CPF precisa de 11 dígitos e CNPJ de 14.',
  ),
  observacoes: opcional,
})

export type DadosFormularioCliente = z.input<typeof esquemaCliente>
