import { z } from 'zod'

/**
 * Converte o que a pessoa digita em número. No Brasil se escreve 1.234,56 —
 * o ponto é separador de milhar e a vírgula é decimal, ao contrário do que o
 * Number() do JavaScript espera.
 */
export function paraNumero(texto: string): number {
  const limpo = texto.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  if (limpo === '') return 0
  const n = Number(limpo)
  return Number.isFinite(n) ? n : Number.NaN
}

/** Campo de dinheiro ou quantidade: obrigatório, nunca negativo. */
export function campoNumerico(mensagem = 'Informe um valor válido.') {
  return z
    .string()
    .trim()
    .transform(paraNumero)
    .refine((v) => Number.isFinite(v) && v >= 0, mensagem)
}

/** Campo numérico inteiro e opcional, como o tempo estimado de um serviço. */
export function campoInteiroOpcional(mensagem = 'Informe um número inteiro.') {
  return z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Math.round(paraNumero(v))))
    .nullable()
    .refine((v) => v === null || (Number.isFinite(v) && v > 0), mensagem)
}
