import { z } from 'zod'

const opcional = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()

/** Aceita o padrão antigo (ABC1234) e o Mercosul (ABC1D23). */
const PADRAO_PLACA = /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/

export const esquemaMoto = z.object({
  placa: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .refine((v) => v.length > 0, 'Informe a placa.')
    .refine(
      (v) => PADRAO_PLACA.test(v),
      'Placa fora do padrão. Use ABC1234 ou ABC1D23.',
    ),
  marca: opcional,
  modelo: opcional,
  ano: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v)))
    .nullable()
    .refine(
      (v) => v === null || (Number.isInteger(v) && v >= 1900 && v <= new Date().getFullYear() + 1),
      'Ano inválido.',
    ),
  cor: opcional,
  chassi: opcional,
  km_atual: z
    .string()
    .trim()
    .transform((v) => (v === '' ? 0 : Number(v.replace(/\D/g, ''))))
    .refine((v) => Number.isFinite(v) && v >= 0, 'Quilometragem inválida.'),
})

export const esquemaNovaMoto = esquemaMoto.extend({
  cliente_id: z.string().min(1, 'Escolha o dono da moto.'),
})

export const esquemaKm = z.object({
  km_atual: z
    .string()
    .trim()
    .transform((v) => Number(v.replace(/\D/g, '')))
    .refine((v) => Number.isFinite(v) && v >= 0, 'Informe a quilometragem.'),
})

export type DadosFormularioMoto = z.input<typeof esquemaMoto>
export type DadosFormularioNovaMoto = z.input<typeof esquemaNovaMoto>
export type DadosFormularioKm = z.input<typeof esquemaKm>
