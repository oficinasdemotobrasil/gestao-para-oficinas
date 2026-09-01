import { z } from 'zod'

export const esquemaEntrar = z.object({
  email: z
    .string()
    .min(1, 'Informe o e-mail.')
    .email('E-mail inválido. Confira se não faltou o @.'),
  senha: z.string().min(1, 'Informe a senha.'),
})

export const esquemaEsqueciSenha = z.object({
  email: z
    .string()
    .min(1, 'Informe o e-mail.')
    .email('E-mail inválido. Confira se não faltou o @.'),
})

export const esquemaNovaSenha = z
  .object({
    senha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.'),
    confirmacao: z.string().min(1, 'Repita a senha.'),
  })
  .refine((d) => d.senha === d.confirmacao, {
    path: ['confirmacao'],
    message: 'As senhas não são iguais.',
  })

export type DadosEntrar = z.infer<typeof esquemaEntrar>
export type DadosEsqueciSenha = z.infer<typeof esquemaEsqueciSenha>
export type DadosNovaSenha = z.infer<typeof esquemaNovaSenha>
