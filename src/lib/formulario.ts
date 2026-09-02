import { zodResolver } from '@hookform/resolvers/zod'
import type { FieldValues, Resolver } from 'react-hook-form'
import type { ZodTypeAny } from 'zod'

/**
 * Liga o Zod ao React Hook Form declarando os dois tipos: o que a pessoa digita
 * e o que sai convertido.
 *
 * Por que isto existe: campo de HTML só devolve texto, então os esquemas
 * convertem — "2025" vira o número 2025, "45,00" vira 45. O React Hook Form
 * entrega ao onSubmit os dados JÁ convertidos, mas a versão 3 do zodResolver não
 * declara isso no tipo. Sem essa declaração, a tela parecia receber texto, e a
 * saída fácil era converter de novo — o que quebrava com "invalid_type,
 * expected string, received number".
 *
 * Foi o defeito que derrubou o cadastro de moto, de produto e de serviço. Com o
 * tipo certo, o compilador recusa a segunda conversão.
 */
export function resolverZod<Entrada extends FieldValues, Saida extends FieldValues>(
  esquema: ZodTypeAny,
): Resolver<Entrada, unknown, Saida> {
  return zodResolver(esquema) as unknown as Resolver<Entrada, unknown, Saida>
}
