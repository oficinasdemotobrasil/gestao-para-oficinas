/**
 * A chave de acesso da NFe/NFCe — os 44 dígitos que identificam a nota de
 * ponta a ponta no país inteiro. Ela já carrega dentro de si o número da
 * nota, então quem tem a chave não devia precisar digitar o número de novo.
 *
 * Posições (cada bloco de dígitos, começando em 1):
 *   1–2   UF
 *   3–6   Ano e mês de emissão (AAMM)
 *   7–20  CNPJ de quem emitiu
 *   21–22 Modelo do documento (55 = NFe, 65 = NFCe)
 *   23–25 Série
 *   26–34 Número da nota
 *   35    Forma de emissão
 *   36–43 Código numérico
 *   44    Dígito verificador
 *
 * Não validamos o dígito verificador aqui — isso é conferência de verdade
 * contra a Sefaz, que é trabalho futuro do contador. Aqui só se confirma a
 * FORMA (44 dígitos), e se extrai o que é óbvio de ler sem sair do celular.
 */

export function chaveValida(chave: string): boolean {
  return /^\d{44}$/.test(chave)
}

export interface DadosDaChave {
  numero: string
  modelo: 'NFe' | 'NFCe' | 'outro'
}

/** Retorna null se a chave não tem 44 dígitos — chame chaveValida antes, se quiser distinguir o motivo. */
export function lerChave(chave: string): DadosDaChave | null {
  if (!chaveValida(chave)) return null
  const numero = String(Number(chave.slice(25, 34))) // tira os zeros à esquerda
  const modeloCodigo = chave.slice(20, 22)
  const modelo = modeloCodigo === '55' ? 'NFe' : modeloCodigo === '65' ? 'NFCe' : 'outro'
  return { numero, modelo }
}

/**
 * O QR code do DANFE aponta para a página de consulta da Sefaz do estado, e
 * a chave vem dentro da URL — mas cada estado monta essa URL de um jeito. O
 * que é sempre verdade: em algum lugar da URL existem 44 dígitos seguidos.
 * Isso é o bastante para não depender de reconhecer a URL de 27 estados
 * diferentes.
 */
export function chaveDoConteudoDoQr(conteudo: string): string | null {
  const achado = conteudo.match(/\d{44}/)
  return achado ? achado[0] : null
}
