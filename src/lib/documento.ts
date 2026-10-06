/**
 * CPF e CNPJ de verdade, e não só com a quantidade certa de números.
 *
 * Os dois últimos dígitos de um CPF ou CNPJ são uma conta feita com os
 * anteriores (o dígito verificador). Um número trocado na digitação quase
 * sempre quebra essa conta — e é isso que pega o erro aqui, no campo, em vez
 * de lá no provedor de pagamento, longe de onde a pessoa pode corrigir.
 *
 * Não diz se o documento é de quem digitou: isso nenhuma conta resolve.
 */

function digitos(valor: string): number[] {
  return valor.replace(/\D/g, '').split('').map(Number)
}

/** O dígito verificador a partir dos anteriores, com os pesos dados. */
function verificador(numeros: number[], pesos: number[]): number {
  const soma = pesos.reduce((total, peso, i) => total + numeros[i] * peso, 0)
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

/** "111.111.111-11" passa na conta, mas não existe. */
function todosIguais(numeros: number[]): boolean {
  return numeros.every((n) => n === numeros[0])
}

export function cpfValido(valor: string): boolean {
  const n = digitos(valor)
  if (n.length !== 11 || todosIguais(n)) return false
  const primeiro = verificador(n, [10, 9, 8, 7, 6, 5, 4, 3, 2])
  const segundo = verificador(n, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
  return n[9] === primeiro && n[10] === segundo
}

export function cnpjValido(valor: string): boolean {
  const n = digitos(valor)
  if (n.length !== 14 || todosIguais(n)) return false
  const primeiro = verificador(n, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const segundo = verificador(n, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return n[12] === primeiro && n[13] === segundo
}
