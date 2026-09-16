/**
 * A leitura da chave de acesso — 44 dígitos que já carregam o número da
 * nota dentro deles, e o que sobra de um QR code depois de tirar a URL do
 * estado em volta.
 *
 *   npm run teste:chave-de-acesso
 */
import { chaveValida, lerChave, chaveDoConteudoDoQr } from '../src/funcionalidades/notas-fiscais/chaveDeAcesso'

let passou = 0
let falhou = 0
const ok = (n: string, d = '') => { passou++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? ` (${d})` : ''}`) }
const erro = (n: string, d: string) => { falhou++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`) }

// Uma chave montada campo a campo, para o teste continuar legível — não
// precisa ser uma chave real (o dígito verificador não é conferido).
const campo = (valor: string, tamanho: number) => valor.padStart(tamanho, '0').slice(0, tamanho)
const chaveNFe = [
  campo('26', 2),        // UF (Pernambuco)
  campo('2609', 4),       // ano/mês
  campo('12345678000199', 14), // CNPJ
  campo('55', 2),         // modelo: NFe
  campo('1', 3),          // série
  campo('9001', 9),       // número da nota
  campo('1', 1),          // forma de emissão
  campo('12345678', 8),   // código numérico
  campo('0', 1),          // dígito verificador
].join('')

const chaveNFCe = chaveNFe.slice(0, 20) + '65' + chaveNFe.slice(22)

console.log('\n\x1b[1mForma da chave\x1b[0m')

chaveNFe.length === 44
  ? ok('a chave de teste tem 44 dígitos, como uma de verdade', String(chaveNFe.length))
  : erro('montagem do teste', `veio com ${chaveNFe.length} dígitos — o teste está errado, não o código`)

chaveValida(chaveNFe)
  ? ok('44 dígitos é aceito')
  : erro('chave de 44 dígitos recusada', 'deveria aceitar')

chaveValida(chaveNFe.slice(0, 43))
  ? erro('43 dígitos aceito', 'deveria recusar')
  : ok('43 dígitos é recusado')

chaveValida(chaveNFe + '0')
  ? erro('45 dígitos aceito', 'deveria recusar')
  : ok('45 dígitos é recusado')

chaveValida(chaveNFe.slice(0, 43) + 'a')
  ? erro('letra no meio aceita', 'deveria recusar')
  : ok('letra no meio é recusada')

chaveValida(' ' + chaveNFe)
  ? erro('chave com espaço aceita sem limpar', 'deveria recusar — quem digita cola com espaço junto')
  : ok('chave com espaço é recusada (limpar antes é responsabilidade de quem chama)')

console.log('\n\x1b[1mO que se extrai da chave\x1b[0m')

const lidaNFe = lerChave(chaveNFe)
lidaNFe?.numero === '9001'
  ? ok('o número da nota sai sem os zeros à esquerda', lidaNFe.numero)
  : erro('número extraído', `veio "${lidaNFe?.numero}"`)

lidaNFe?.modelo === 'NFe'
  ? ok('reconhece modelo 55 como NFe')
  : erro('modelo NFe', `veio "${lidaNFe?.modelo}"`)

lerChave(chaveNFCe)?.modelo === 'NFCe'
  ? ok('reconhece modelo 65 como NFCe')
  : erro('modelo NFCe', `veio "${lerChave(chaveNFCe)?.modelo}"`)

lerChave('123')
  ? erro('chave curta retorna dados', 'deveria retornar null')
  : ok('chave inválida retorna null, não quebra')

// Número que já começa sem zero, para não sobrar um "0" fantasma.
const chaveNumeroUm = chaveNFe.slice(0, 25) + campo('1', 9) + chaveNFe.slice(34)
lerChave(chaveNumeroUm)?.numero === '1'
  ? ok('número 1 não vira "000000001" nem some', lerChave(chaveNumeroUm)?.numero)
  : erro('número pequeno', `veio "${lerChave(chaveNumeroUm)?.numero}"`)

console.log('\n\x1b[1mO QR code do DANFE\x1b[0m')

// Cada estado monta a URL de um jeito — o teste usa duas formas bem
// diferentes para provar que não é "decorado" para uma só.
const urlPE = `https://nfce.sefaz.pe.gov.br/nfce/consulta?p=${chaveNFe}|2|1|1|`
chaveDoConteudoDoQr(urlPE) === chaveNFe
  ? ok('acha a chave dentro da URL de um estado (PE)')
  : erro('QR de PE', `veio "${chaveDoConteudoDoQr(urlPE)}"`)

const urlSP = `www.nfce.fazenda.sp.gov.br/qrcode?chNFe=${chaveNFe}&nVersao=100`
chaveDoConteudoDoQr(urlSP) === chaveNFe
  ? ok('acha a chave dentro de uma URL com formato diferente (SP)')
  : erro('QR de SP', `veio "${chaveDoConteudoDoQr(urlSP)}"`)

chaveDoConteudoDoQr('qualquer coisa sem número de 44 dígitos aqui')
  ? erro('achou chave onde não tem', 'deveria retornar null')
  : ok('conteúdo sem chave nenhuma retorna null')

console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
process.exit(falhou > 0 ? 1 : 0)
