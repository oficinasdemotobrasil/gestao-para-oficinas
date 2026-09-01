/** Junta classes ignorando falso/nulo. Evita uma dependência só para isso. */
export function cn(...partes: Array<string | false | null | undefined>): string {
  return partes.filter(Boolean).join(' ')
}
