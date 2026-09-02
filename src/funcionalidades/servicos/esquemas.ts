import { z } from 'zod'
import { campoNumerico, campoInteiroOpcional } from '@/lib/numero'

export const esquemaServico = z.object({
  nome: z.string().trim().min(2, 'Informe o nome do serviço.').max(120, 'Nome muito longo.'),
  descricao: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .nullable(),
  preco: campoNumerico('Informe o preço do serviço.'),
  tempo_estimado_minutos: campoInteiroOpcional('Tempo em minutos, só números.'),
  ativo: z.boolean(),
})

export type DadosFormularioServico = z.input<typeof esquemaServico>
/** O que sai do Zod, já convertido — é isto que chega no onSubmit. */
export type DadosServicoValidados = z.output<typeof esquemaServico>
