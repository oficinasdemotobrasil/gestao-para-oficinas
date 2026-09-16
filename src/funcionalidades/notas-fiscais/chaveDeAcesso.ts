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
  /** O CNPJ de quem emitiu — dá para descobrir o nome do fornecedor com ele. */
  cnpjEmitente: string
}

/** Retorna null se a chave não tem 44 dígitos — chame chaveValida antes, se quiser distinguir o motivo. */
export function lerChave(chave: string): DadosDaChave | null {
  if (!chaveValida(chave)) return null
  const numero = String(Number(chave.slice(25, 34))) // tira os zeros à esquerda
  const modeloCodigo = chave.slice(20, 22)
  const modelo = modeloCodigo === '55' ? 'NFe' : modeloCodigo === '65' ? 'NFCe' : 'outro'
  return { numero, modelo, cnpjEmitente: chave.slice(6, 20) }
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

/**
 * Descobre o nome do fornecedor a partir do CNPJ que vem dentro da chave.
 *
 * Usa a BrasilAPI, que é pública, gratuita e não exige cadastro. É
 * conveniência, não requisito: se a consulta falhar, estiver fora do ar ou o
 * CNPJ não existir, devolve null e a pessoa digita o nome — nada quebra.
 *
 * Só o nome da empresa é lido. A resposta da API traz também sócios e CPFs,
 * que são dados pessoais de terceiros e não têm nada que fazer aqui.
 */
export async function nomeDoFornecedorPeloCnpj(cnpj: string): Promise<string | null> {
  const limpo = cnpj.replace(/\D/g, '')
  if (limpo.length !== 14) return null

  try {
    const resposta = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${limpo}`)
    if (!resposta.ok) return null
    const dados = (await resposta.json()) as { razao_social?: string; nome_fantasia?: string }
    const nome = dados.nome_fantasia?.trim() || dados.razao_social?.trim()
    return nome || null
  } catch {
    return null
  }
}
