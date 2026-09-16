/**
 * A validação dos campos fiscais — compartilhada entre entrada e saída,
 * porque as duas guardam a mesma forma de dado (CFOP, ICMS, ISS, base de
 * cálculo). O banco também tem suas próprias travas (CHECK de valor não
 * negativo, índice único de duplicidade); isto aqui existe para pegar o erro
 * ANTES da rede, com a peça errada apontada, em vez de descobrir só depois
 * que o Postgres recusou.
 *
 * O que NÃO é validado de propósito: se o CFOP existe de verdade, se bate com
 * a natureza da operação, se o ICMS está calculado certo. Isso é trabalho de
 * contador — a conexão com a Sefaz, quando existir, é quem vai calcular e
 * conferir. Aqui só se garante que o que foi digitado tem a FORMA certa.
 */
import { z } from 'zod'

/** CFOP são sempre 4 dígitos (ex: 5102, 1102). Aceita com ou sem ponto. */
const cfop = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v === '' || v.length === 4, 'CFOP tem 4 dígitos (ex: 5102).')
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional()

const valorFiscal = z
  .number()
  .refine((v) => v >= 0, 'Não pode ser negativo.')
  .nullable()
  .optional()

export const esquemaCamposFiscais = z
  .object({
    natureza_operacao: z.string().trim().nullable().optional(),
    cfop,
    base_calculo_icms: valorFiscal,
    valor_icms: valorFiscal,
    base_calculo_iss: valorFiscal,
    valor_iss: valorFiscal,
  })
  .refine(
    (d) => !(d.valor_icms && d.valor_icms > 0) || (d.base_calculo_icms ?? 0) > 0,
    { message: 'Informe a base de cálculo do ICMS junto do valor.', path: ['base_calculo_icms'] },
  )
  .refine(
    (d) => !(d.valor_iss && d.valor_iss > 0) || (d.base_calculo_iss ?? 0) > 0,
    { message: 'Informe a base de cálculo do ISS junto do valor.', path: ['base_calculo_iss'] },
  )

export type CamposFiscais = z.input<typeof esquemaCamposFiscais>

/**
 * Levanta um erro em português, no mesmo estilo das mensagens que vêm do
 * banco — para não precisar de dois jeitos de mostrar erro na tela.
 */
export function validarCamposFiscais(dados: CamposFiscais): void {
  const r = esquemaCamposFiscais.safeParse(dados)
  if (!r.success) throw new Error(r.error.issues[0]?.message ?? 'Campos fiscais inválidos.')
}

/** Todo item, de entrada ou saída, precisa de quantidade e valor coerentes. */
export function validarItens(
  itens: Array<{ quantidade: number; valor_unitario?: number }>,
): void {
  if (itens.length === 0) {
    throw new Error('Adicione pelo menos um item à nota.')
  }
  for (const item of itens) {
    if (!Number.isFinite(item.quantidade) || item.quantidade <= 0) {
      throw new Error('Um dos itens está com quantidade inválida.')
    }
    if (item.valor_unitario !== undefined && (!Number.isFinite(item.valor_unitario) || item.valor_unitario < 0)) {
      throw new Error('Um dos itens está com valor inválido.')
    }
  }
}
