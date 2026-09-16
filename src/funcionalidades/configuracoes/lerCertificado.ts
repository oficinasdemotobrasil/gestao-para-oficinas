import forge from 'node-forge'

/**
 * Lê o certificado digital A1 (arquivo .pfx) sem mandá-lo para lugar nenhum.
 *
 * Um A1 assina documento legal em nome da empresa: com ele se emite nota
 * fiscal no CNPJ do dono. Por isso este arquivo nunca é gravado no nosso
 * banco — ele é aberto aqui, na máquina de quem subiu, só para conferir se
 * está bom e até quando vale. O que guardamos é a resposta dessas duas
 * perguntas, nunca o arquivo.
 *
 * O que a leitura resolve na hora, e que doeria descobrir semanas depois:
 *   - senha errada (o erro mais comum, e silencioso se ninguém conferir)
 *   - arquivo trocado (o .pfx de outra empresa, ou um arquivo qualquer)
 *   - certificado já vencido
 *   - CNPJ do certificado diferente do CNPJ cadastrado na oficina
 */

export interface CertificadoLido {
  /** Só os 14 dígitos. */
  cnpj: string | null
  /** Nome como está no certificado, sem o CNPJ colado no fim. */
  titular: string
  validoAte: Date
  validoDe: Date
  /** Já passou da validade — o certificado não serve mais. */
  vencido: boolean
  /** Quantos dias faltam. Negativo quando já venceu. */
  diasParaVencer: number
}

export class CertificadoInvalido extends Error {}
export class SenhaDoCertificadoErrada extends CertificadoInvalido {}

/**
 * No padrão ICP-Brasil, o nome do titular vem com o documento colado no fim:
 * "OFICINA TIAGO CARVALHO LTDA:12345678000199". É daí que sai o CNPJ.
 */
function separarNomeEDocumento(nomeComum: string): { titular: string; cnpj: string | null } {
  const partes = nomeComum.split(':')
  if (partes.length < 2) return { titular: nomeComum.trim(), cnpj: null }

  const documento = partes[partes.length - 1].replace(/\D/g, '')
  const titular = partes.slice(0, -1).join(':').trim()
  return { titular, cnpj: documento.length === 14 ? documento : null }
}

export function lerCertificado(conteudo: ArrayBuffer, senha: string): CertificadoLido {
  let p12: forge.pkcs12.Pkcs12Pfx
  try {
    const binario = forge.util.createBuffer(new Uint8Array(conteudo))
    const asn1 = forge.asn1.fromDer(binario)
    // Esta linha é a que valida a senha: com a senha errada, o node-forge
    // não consegue decifrar e levanta exceção.
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, senha)
  } catch (e) {
    const mensagem = String((e as Error)?.message ?? '').toLowerCase()
    // A biblioteca fala em inglês e sem distinguir muito bem os casos; o que
    // dá para separar com segurança é "não abriu por causa da senha" de
    // "isto não é um certificado".
    if (mensagem.includes('mac') || mensagem.includes('password') || mensagem.includes('invalid password')) {
      throw new SenhaDoCertificadoErrada('Senha do certificado incorreta.')
    }
    throw new CertificadoInvalido('Este arquivo não parece ser um certificado A1 (.pfx ou .p12).')
  }

  const sacos = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []
  const certificados = sacos.map((s) => s.cert).filter((c): c is forge.pki.Certificate => Boolean(c))

  if (certificados.length === 0) {
    throw new CertificadoInvalido('O arquivo abriu, mas não tem certificado dentro dele.')
  }

  // Um .pfx traz o certificado da empresa e os da cadeia (autoridade
  // certificadora). O da empresa é o que NÃO é autoridade certificadora —
  // pegar o primeiro da lista daria a cadeia em alguns arquivos.
  const daEmpresa =
    certificados.find((c) => {
      const restricao = c.getExtension('basicConstraints') as { cA?: boolean } | undefined
      return !restricao?.cA
    }) ?? certificados[0]

  const nomeComum = daEmpresa.subject.getField('CN')?.value ?? ''
  const { titular, cnpj } = separarNomeEDocumento(String(nomeComum))

  const validoAte = daEmpresa.validity.notAfter
  const agora = new Date()
  const diasParaVencer = Math.floor((validoAte.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24))

  return {
    cnpj,
    titular: titular || 'Titular não identificado',
    validoAte,
    validoDe: daEmpresa.validity.notBefore,
    vencido: validoAte.getTime() < agora.getTime(),
    diasParaVencer,
  }
}

/** Mesma formatação do resto do app, para a tela mostrar o CNPJ legível. */
export function formatarCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14) return cnpj
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}
