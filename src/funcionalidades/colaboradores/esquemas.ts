import { z } from 'zod'

const perfil = z.enum(['admin', 'vendedor', 'mecanico'], {
  errorMap: () => ({ message: 'Escolha o perfil de acesso.' }),
})

const telefone = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .refine(
    (v) => v === null || v.replace(/\D/g, '').length >= 10,
    'Telefone incompleto. Inclua o DDD.',
  )

export const esquemaNovoColaborador = z.object({
  nome: z.string().trim().min(2, 'Informe o nome do colaborador.'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Informe o e-mail.')
    .email('E-mail inválido. Confira se não faltou o @.'),
  senha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.'),
  telefone,
  perfil,
})

export const esquemaColaborador = z.object({
  nome: z.string().trim().min(2, 'Informe o nome do colaborador.'),
  telefone,
  perfil,
})

export type DadosFormularioNovoColaborador = z.input<typeof esquemaNovoColaborador>
export type DadosFormularioColaborador = z.input<typeof esquemaColaborador>
