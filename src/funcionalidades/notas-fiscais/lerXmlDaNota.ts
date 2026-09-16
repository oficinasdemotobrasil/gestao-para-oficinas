import { XMLParser } from 'fast-xml-parser'

/**
 * Lê o XML da NFe e devolve o que a tela de lançamento precisa.
 *
 * O XML é o documento de verdade: a chave de acesso é só o número dele. Quem
 * tem o arquivo tem tudo — fornecedor, cada peça, quantidade, custo, NCM,
 * CFOP, impostos — sem consultar a Sefaz nem pagar consulta a ninguém. O
 * fornecedor é obrigado por lei a mandar esse arquivo, e quase sempre manda
 * junto com o DANFE por e-mail.
 *
 * Aqui não se valida assinatura digital nem se confere nada contra a Sefaz.
 * Isso é conferência fiscal, trabalho do contador. O que se faz é ler o que
 * está escrito, para ninguém digitar quarenta linhas na mão.
 *
 * O layout é o da NFe 4.0. Os caminhos têm duas formas no mundo real: o
 * arquivo "puro" (raiz <NFe>) e o de distribuição, com protocolo de
 * autorização em volta (raiz <nfeProc>). As duas são tratadas.
 */

export interface ItemDoXml {
  /** Código do produto no catálogo do FORNECEDOR, não no nosso. */
  codigo: string
  descricao: string
  ncm: string | null
  cfop: string | null
  unidade: string
  quantidade: number
  valorUnitario: number
  valorTotal: number
}

export interface NotaDoXml {
  chaveAcesso: string | null
  numero: string
  serie: string | null
  /** aaaa-mm-dd, já sem a hora e sem o fuso que vêm no XML. */
  dataEmissao: string | null
  naturezaOperacao: string | null
  fornecedorNome: string | null
  fornecedorCnpj: string | null
  valorTotal: number
  baseCalculoIcms: number | null
  valorIcms: number | null
  itens: ItemDoXml[]
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  // Sem isto, uma nota de UM item vira objeto e uma de VÁRIOS vira array — e o
  // código que trata as duas formas é onde mora o erro que só aparece na nota
  // de item único, em produção, na frente do cliente.
  isArray: (nome) => nome === 'det',
  parseTagValue: false,
  trimValues: true,
})

/** Números no XML vêm como texto com ponto decimal, nunca com vírgula. */
function numero(valor: unknown): number {
  const n = Number(String(valor ?? '').trim())
  return Number.isFinite(n) ? n : 0
}

function texto(valor: unknown): string | null {
  const s = String(valor ?? '').trim()
  return s === '' ? null : s
}

export class XmlInvalido extends Error {}

export function lerXmlDaNota(conteudo: string): NotaDoXml {
  let raiz: Record<string, unknown>
  try {
    raiz = parser.parse(conteudo) as Record<string, unknown>
  } catch {
    throw new XmlInvalido('Não consegui ler este arquivo. Ele precisa ser o XML da nota, não o PDF.')
  }

  // nfeProc é o XML com o protocolo de autorização em volta — o formato que o
  // fornecedor manda por e-mail. NFe solta também acontece.
  const proc = raiz.nfeProc as Record<string, unknown> | undefined
  const nfe = (proc?.NFe ?? raiz.NFe) as Record<string, unknown> | undefined
  const inf = nfe?.infNFe as Record<string, unknown> | undefined

  if (!inf) {
    throw new XmlInvalido('Este XML não parece ser de uma nota fiscal eletrônica.')
  }

  const ide = (inf.ide ?? {}) as Record<string, unknown>
  const emit = (inf.emit ?? {}) as Record<string, unknown>
  const total = ((inf.total as Record<string, unknown>)?.ICMSTot ?? {}) as Record<string, unknown>
  const dets = (inf.det ?? []) as Array<Record<string, unknown>>

  // O Id vem como "NFe35260855831184000638550010001690891359884301".
  const idBruto = String(inf['@Id'] ?? '')
  const chave = idBruto.replace(/\D/g, '')

  const itens: ItemDoXml[] = dets.map((det) => {
    const prod = (det.prod ?? {}) as Record<string, unknown>
    return {
      codigo: String(prod.cProd ?? '').trim(),
      descricao: String(prod.xProd ?? '').trim(),
      ncm: texto(prod.NCM),
      cfop: texto(prod.CFOP),
      unidade: String(prod.uCom ?? 'un').trim().toLowerCase(),
      quantidade: numero(prod.qCom),
      valorUnitario: numero(prod.vUnCom),
      valorTotal: numero(prod.vProd),
    }
  })

  return {
    chaveAcesso: chave.length === 44 ? chave : null,
    numero: String(ide.nNF ?? '').trim(),
    serie: texto(ide.serie),
    // dhEmi vem "2026-08-15T10:30:00-03:00"; dEmi (layout antigo) já vem só a data.
    dataEmissao: texto(ide.dhEmi ?? ide.dEmi)?.slice(0, 10) ?? null,
    naturezaOperacao: texto(ide.natOp),
    fornecedorNome: texto(emit.xNome ?? emit.xFant),
    fornecedorCnpj: texto(emit.CNPJ ?? emit.CPF),
    valorTotal: numero(total.vNF),
    baseCalculoIcms: total.vBC != null ? numero(total.vBC) : null,
    valorIcms: total.vICMS != null ? numero(total.vICMS) : null,
    itens,
  }
}
