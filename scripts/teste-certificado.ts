/**
 * A leitura do certificado digital A1.
 *
 * O teste GERA certificados de verdade (mesma biblioteca, formato PKCS#12
 * real) em vez de simular: senha errada, vencido, e o padrão ICP-Brasil com
 * o CNPJ colado no nome. Assim o que passa aqui é o mesmo caminho que roda
 * quando o Tiago sobe o arquivo dele.
 *
 *   npm run teste:certificado
 */
import forge from 'node-forge'
import {
  lerCertificado,
  formatarCnpj,
  CertificadoInvalido,
  SenhaDoCertificadoErrada,
} from '../src/funcionalidades/configuracoes/lerCertificado'

let passou = 0
let falhou = 0
const ok = (n: string, d = '') => { passou++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? ` (${d})` : ''}`) }
const erro = (n: string, d: string) => { falhou++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`) }

/** Monta um .pfx igual ao que a certificadora entrega. */
function gerarPfx(opcoes: {
  nomeComum: string
  senha: string
  diasDeValidade: number
  diasAtras?: number
}): ArrayBuffer {
  const chaves = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = chaves.publicKey
  cert.serialNumber = '01'

  const inicio = new Date()
  inicio.setDate(inicio.getDate() - (opcoes.diasAtras ?? 1))
  const fim = new Date()
  fim.setDate(fim.getDate() + opcoes.diasDeValidade)
  cert.validity.notBefore = inicio
  cert.validity.notAfter = fim

  const dados = [{ name: 'commonName', value: opcoes.nomeComum }]
  cert.setSubject(dados)
  cert.setIssuer([{ name: 'commonName', value: 'AC TESTE' }])
  cert.setExtensions([{ name: 'basicConstraints', cA: false }])
  cert.sign(chaves.privateKey)

  const p12 = forge.pkcs12.toPkcs12Asn1(chaves.privateKey, [cert], opcoes.senha)
  const der = forge.asn1.toDer(p12).getBytes()
  const bytes = new Uint8Array(der.length)
  for (let i = 0; i < der.length; i++) bytes[i] = der.charCodeAt(i)
  return bytes.buffer
}

console.log('\n\x1b[1mCertificado bom, no padrão ICP-Brasil\x1b[0m')

const bom = gerarPfx({
  nomeComum: 'OFICINA TIAGO CARVALHO LTDA:12345678000199',
  senha: 'senha-certa',
  diasDeValidade: 400,
})
try {
  const lido = lerCertificado(bom, 'senha-certa')
  lido.cnpj === '12345678000199'
    ? ok('separa o CNPJ que vem colado no nome', lido.cnpj)
    : erro('CNPJ', `veio "${lido.cnpj}"`)
  lido.titular === 'OFICINA TIAGO CARVALHO LTDA'
    ? ok('e o nome sai limpo, sem o CNPJ junto', lido.titular)
    : erro('titular', `veio "${lido.titular}"`)
  !lido.vencido ? ok('não está vencido') : erro('vencido', 'disse que venceu')
  lido.diasParaVencer > 390 && lido.diasParaVencer <= 400
    ? ok('calcula os dias que faltam', `${lido.diasParaVencer} dias`)
    : erro('dias para vencer', `veio ${lido.diasParaVencer}`)
} catch (e) {
  erro('certificado bom foi recusado', (e as Error).message)
}

console.log('\n\x1b[1mSenha errada — o erro mais comum\x1b[0m')
try {
  lerCertificado(bom, 'senha-errada')
  erro('senha errada foi aceita', 'deveria ter sido recusada')
} catch (e) {
  e instanceof SenhaDoCertificadoErrada
    ? ok('recusa e diz que é a senha', (e as Error).message)
    : erro('erro de senha veio como outra coisa', `${e?.constructor?.name}: ${(e as Error).message}`)
}

console.log('\n\x1b[1mCertificado vencido\x1b[0m')
const vencido = gerarPfx({
  nomeComum: 'OFICINA VENCIDA LTDA:98765432000188',
  senha: 'x',
  diasDeValidade: -10,
  diasAtras: 400,
})
try {
  const lido = lerCertificado(vencido, 'x')
  lido.vencido
    ? ok('reconhece que venceu', `${lido.diasParaVencer} dias`)
    : erro('vencido não detectado', `diasParaVencer=${lido.diasParaVencer}`)
  lido.diasParaVencer < 0
    ? ok('e os dias ficam negativos, não zero')
    : erro('dias de vencido', `veio ${lido.diasParaVencer}`)
} catch (e) {
  erro('certificado vencido não deveria falhar ao ler', (e as Error).message)
}

console.log('\n\x1b[1mArquivo que não é certificado\x1b[0m')
const lixo = new TextEncoder().encode('%PDF-1.4 isto é um PDF, não um certificado').buffer
try {
  lerCertificado(lixo, 'qualquer')
  erro('PDF foi aceito', 'deveria ter sido recusado')
} catch (e) {
  e instanceof CertificadoInvalido && !(e instanceof SenhaDoCertificadoErrada)
    ? ok('recusa dizendo que não é certificado', (e as Error).message)
    : erro('PDF recusado com erro errado', (e as Error).message)
}

console.log('\n\x1b[1mCertificado sem CNPJ no nome (pessoa física, ou fora do padrão)\x1b[0m')
const semCnpj = gerarPfx({ nomeComum: 'FULANO DE TAL', senha: 'y', diasDeValidade: 100 })
try {
  const lido = lerCertificado(semCnpj, 'y')
  lido.cnpj === null
    ? ok('devolve CNPJ nulo em vez de inventar um')
    : erro('CNPJ inventado', `veio "${lido.cnpj}"`)
  lido.titular === 'FULANO DE TAL'
    ? ok('mas o nome continua legível')
    : erro('titular', `veio "${lido.titular}"`)
} catch (e) {
  erro('certificado sem CNPJ falhou', (e as Error).message)
}

console.log('\n\x1b[1mFormatação do CNPJ para a tela\x1b[0m')
formatarCnpj('12345678000199') === '12.345.678/0001-99'
  ? ok('formata com pontuação', formatarCnpj('12345678000199'))
  : erro('formatação', formatarCnpj('12345678000199'))
formatarCnpj('123') === '123'
  ? ok('devolve como veio quando não dá para formatar')
  : erro('CNPJ curto', formatarCnpj('123'))

console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
process.exit(falhou > 0 ? 1 : 0)
