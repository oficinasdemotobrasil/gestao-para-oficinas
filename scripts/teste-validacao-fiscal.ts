/**
 * A validação dos campos fiscais e dos itens, sem banco nenhum — é lógica
 * pura, e o risco aqui é a mensagem errada travar (ou deixar passar) um
 * lançamento de verdade.
 *
 *   npm run teste:validacao-fiscal
 */
import {
  validarCamposFiscais,
  validarItens,
} from '../src/funcionalidades/notas-fiscais/validacaoFiscal'

let passou = 0
let falhou = 0
const ok = (n: string, d = '') => { passou++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? ` (${d})` : ''}`) }
const erro = (n: string, d: string) => { falhou++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`) }

function esperaPassar(nome: string, fn: () => void) {
  try {
    fn()
    ok(nome)
  } catch (e) {
    erro(nome, `foi recusado: ${(e as Error).message}`)
  }
}

function esperaRecusar(nome: string, fn: () => void, trechoEsperado?: string) {
  try {
    fn()
    erro(nome, 'foi aceito, e deveria ter sido recusado')
  } catch (e) {
    const msg = (e as Error).message
    if (trechoEsperado && !msg.includes(trechoEsperado)) {
      erro(nome, `recusou, mas com a mensagem errada: "${msg}" (esperava conter "${trechoEsperado}")`)
    } else {
      ok(nome, msg)
    }
  }
}

console.log('\n\x1b[1mCampos fiscais\x1b[0m')

esperaPassar('nenhum campo preenchido é válido (nota sem detalhe fiscal)', () =>
  validarCamposFiscais({}),
)

esperaPassar('CFOP de 4 dígitos passa', () =>
  validarCamposFiscais({ cfop: '5102' }),
)

esperaRecusar('CFOP de 3 dígitos é recusado', () =>
  validarCamposFiscais({ cfop: '510' }), 'CFOP')

esperaRecusar('CFOP de 5 dígitos é recusado', () =>
  validarCamposFiscais({ cfop: '51022' }), 'CFOP')

esperaPassar('CFOP com pontuação estranha, mas 4 dígitos no fim, passa (só filtra dígito)', () =>
  validarCamposFiscais({ cfop: '5-1.0-2' }),
)

esperaRecusar('valor de ICMS negativo é recusado', () =>
  validarCamposFiscais({ valor_icms: -10 }), 'negativo')

esperaRecusar('ICMS com valor mas sem base de cálculo é recusado', () =>
  validarCamposFiscais({ valor_icms: 45 }), 'base de cálculo do ICMS')

esperaPassar('ICMS com valor E base de cálculo passa', () =>
  validarCamposFiscais({ valor_icms: 45, base_calculo_icms: 250 }),
)

esperaRecusar('ISS com valor mas sem base de cálculo é recusado', () =>
  validarCamposFiscais({ valor_iss: 12 }), 'base de cálculo do ISS')

esperaPassar('ISS com valor E base de cálculo passa', () =>
  validarCamposFiscais({ valor_iss: 12, base_calculo_iss: 200 }),
)

esperaPassar('ICMS de zero não exige base de cálculo (não é "tem valor")', () =>
  validarCamposFiscais({ valor_icms: 0 }),
)

console.log('\n\x1b[1mItens\x1b[0m')

esperaRecusar('nota sem nenhum item é recusada', () =>
  validarItens([]), 'pelo menos um item')

esperaPassar('um item com quantidade e valor válidos passa', () =>
  validarItens([{ quantidade: 2, valor_unitario: 45 }]),
)

esperaRecusar('quantidade zero é recusada', () =>
  validarItens([{ quantidade: 0, valor_unitario: 10 }]), 'quantidade')

esperaRecusar('quantidade negativa é recusada', () =>
  validarItens([{ quantidade: -1, valor_unitario: 10 }]), 'quantidade')

esperaRecusar('valor unitário negativo é recusado', () =>
  validarItens([{ quantidade: 1, valor_unitario: -5 }]), 'valor')

esperaPassar('item de entrada, sem valor_unitario no tipo, passa (custo é opcional lá)', () =>
  validarItens([{ quantidade: 1 }]),
)

esperaRecusar('um item ruim no meio de vários bons ainda é pego', () =>
  validarItens([
    { quantidade: 1, valor_unitario: 10 },
    { quantidade: 1, valor_unitario: 10 },
    { quantidade: -3, valor_unitario: 10 },
  ]), 'quantidade')

console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
process.exit(falhou > 0 ? 1 : 0)
