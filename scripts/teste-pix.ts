/**
 * Confere o BR Code do PIX contra o exemplo oficial do Banco Central.
 *
 * Este teste existe porque o erro aqui é invisível: um CRC errado gera um
 * código com cara de certo, que o app do banco simplesmente recusa sem dizer
 * por quê. Não dá para descobrir olhando — só comparando com um caso conhecido.
 *
 *   npm run teste:pix
 */
import { gerarBrCode, crc16, chavePixValida, formatarChavePix } from '../src/lib/pix'

let passou = 0
let falhou = 0
const ok = (n: string, d = '') => { passou++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? ` (${d})` : ''}`) }
const erro = (n: string, d: string) => { falhou++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`) }

console.log('\n\x1b[1mBR Code do PIX\x1b[0m')

// Dois casos conhecidos, e a razão de este arquivo existir.
//
// O primeiro é o vetor canônico do CRC-16/CCITT-FALSE: "123456789" tem de dar
// 29B1. Ele prova o algoritmo sozinho, sem depender de PIX nenhum.
crc16('123456789') === '29B1'
  ? ok('o vetor canônico do CRC-16/CCITT-FALSE bate', '29B1')
  : erro('algoritmo do CRC', `123456789 deu ${crc16('123456789')}, esperava 29B1`)

// O segundo é o exemplo do manual do Banco Central. Ele prova a montagem: os
// campos, a ordem, o domínio em minúsculo e o fato de o próprio "6304" entrar
// na conta do CRC — que é onde a maioria dos geradores erra.
const oficial =
  '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000' +
  '5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304'

const crcOficial = crc16(oficial)
crcOficial === '1D3D'
  ? ok('o exemplo do manual do Banco Central fecha em 1D3D', crcOficial)
  : erro('CRC do exemplo oficial', `esperava 1D3D, veio ${crcOficial}`)

// Um código nosso, montado do zero.
const nosso = gerarBrCode({
  chave: '123e4567-e12b-12d1-a456-426655440000',
  tipoDaChave: 'aleatoria',
  nomeDoRecebedor: 'Fulano de Tal',
  cidade: 'BRASILIA',
  valor: 10,
  identificador: null,
})

// O nome sai em maiúsculas na nossa versão, então comparamos o que importa:
// a estrutura, o valor e a validade do CRC.
const semCrc = nosso.slice(0, -4)
crc16(semCrc) === nosso.slice(-4)
  ? ok('o código que geramos fecha com o próprio CRC')
  : erro('CRC do nosso código', nosso)

nosso.includes('5303986') ? ok('moeda em real (986)') : erro('moeda', nosso)
nosso.includes('540510.00') ? ok('valor com ponto e duas casas (10.00)') : erro('valor', nosso)
nosso.includes('5802BR') ? ok('país BR') : erro('país', nosso)
nosso.includes('62070503***') ? ok('sem identificador, vai *** como manda o padrão') : erro('txid', nosso)
nosso.includes('0014br.gov.bcb.pix') ? ok('domínio do arranjo PIX, em minúsculo como o manual') : erro('domínio', nosso)

// Sem valor: o cliente digita quanto vai pagar.
const semValor = gerarBrCode({
  chave: 'oficina@exemplo.com.br', tipoDaChave: 'email',
  nomeDoRecebedor: 'Oficina Teste', cidade: 'Recife', valor: null,
})
!semValor.includes('5405') && !semValor.includes('5406')
  ? ok('cobrança sem valor não traz o campo 54')
  : erro('campo de valor', semValor)

// Acento e traço quebram a leitura em parte dos bancos.
const comAcento = gerarBrCode({
  chave: '11122233344', tipoDaChave: 'cpf',
  nomeDoRecebedor: 'Oficina do Zé — Ação e Manutenção', cidade: 'São Paulo',
  valor: 1, identificador: 'OS 0042',
})
!/[^\x20-\x7E]/.test(comAcento)
  ? ok('nome e cidade saem sem acento, como o padrão exige')
  : erro('acento no código', comAcento)
comAcento.includes('SAO PAULO') ? ok('cidade normalizada (SAO PAULO)') : erro('cidade', comAcento)
comAcento.includes('0506OS0042') ? ok('identificador vai sem espaço') : erro('identificador', comAcento)

// O nome tem limite de 25 caracteres, e estourá-lo invalida o código.
const nomeLongo = gerarBrCode({
  chave: '11122233344', tipoDaChave: 'cpf',
  nomeDoRecebedor: 'Oficina do Ze Motopecas e Servicos Automotivos Ltda ME',
  cidade: 'Recife', valor: 1,
})
const tamanhoDoNome = Number(nomeLongo.slice(nomeLongo.indexOf('59') + 2, nomeLongo.indexOf('59') + 4))
tamanhoDoNome <= 25
  ? ok('nome comprido é cortado em 25 caracteres', `${tamanhoDoNome}`)
  : erro('nome longo', `${tamanhoDoNome} caracteres`)

// Formato e validação das chaves.
formatarChavePix('(81) 98846-9313', 'telefone') === '+5581988469313'
  ? ok('telefone vira +5581988469313')
  : erro('telefone', formatarChavePix('(81) 98846-9313', 'telefone'))
formatarChavePix('111.222.333-44', 'cpf') === '11122233344'
  ? ok('CPF vai só com números')
  : erro('CPF', formatarChavePix('111.222.333-44', 'cpf'))

chavePixValida('111.222.333-44', 'cpf') ? ok('CPF de 11 dígitos é aceito') : erro('validação CPF', 'recusou')
!chavePixValida('111.222.333', 'cpf') ? ok('CPF curto é recusado') : erro('validação CPF', 'aceitou o curto')
chavePixValida('123e4567-e12b-12d1-a456-426655440000', 'aleatoria')
  ? ok('chave aleatória no formato UUID é aceita')
  : erro('validação aleatória', 'recusou')
!chavePixValida('qualquer coisa', 'aleatoria')
  ? ok('e um texto qualquer não passa por chave aleatória')
  : erro('validação aleatória', 'aceitou texto solto')

console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
process.exit(falhou === 0 ? 0 : 1)
