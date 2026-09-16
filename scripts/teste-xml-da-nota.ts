/**
 * O leitor de XML da NFe.
 *
 * Usa a MESMA biblioteca e o MESMO código que roda no navegador — não um
 * paralelo de mentira. O XML de teste segue o layout 4.0 de verdade,
 * inclusive o envelope <nfeProc> com protocolo, que é o formato que chega
 * por e-mail do fornecedor.
 *
 *   npm run teste:xml-da-nota
 */
import { lerXmlDaNota, XmlInvalido } from '../src/funcionalidades/notas-fiscais/lerXmlDaNota'

let passou = 0
let falhou = 0
const ok = (n: string, d = '') => { passou++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? ` (${d})` : ''}`) }
const erro = (n: string, d: string) => { falhou++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`) }
const confere = (nome: string, achado: unknown, esperado: unknown) =>
  JSON.stringify(achado) === JSON.stringify(esperado)
    ? ok(nome, String(achado))
    : erro(nome, `esperava ${JSON.stringify(esperado)}, veio ${JSON.stringify(achado)}`)

const CHAVE = '35260855831184000638550010001690891359884301'

const item = (codigo: string, nome: string, ncm: string, qtd: string, unit: string, tot: string) => `
      <det nItem="1">
        <prod>
          <cProd>${codigo}</cProd>
          <xProd>${nome}</xProd>
          <NCM>${ncm}</NCM>
          <CFOP>5102</CFOP>
          <uCom>UN</uCom>
          <qCom>${qtd}</qCom>
          <vUnCom>${unit}</vUnCom>
          <vProd>${tot}</vProd>
        </prod>
      </det>`

const notaCom = (itens: string) => `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${CHAVE}" versao="4.00">
      <ide>
        <nNF>169089</nNF>
        <serie>1</serie>
        <dhEmi>2026-08-15T10:30:00-03:00</dhEmi>
        <natOp>COMPRA PARA COMERCIALIZACAO</natOp>
      </ide>
      <emit>
        <CNPJ>55831184000638</CNPJ>
        <xNome>DISTRIBUIDORA DE PECAS SAO PAULO LTDA</xNome>
      </emit>
      ${itens}
      <total>
        <ICMSTot>
          <vBC>250.00</vBC>
          <vICMS>45.00</vICMS>
          <vNF>300.00</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
  <protNFe><infProt><cStat>100</cStat></infProt></protNFe>
</nfeProc>`

console.log('\n\x1b[1mCabeçalho da nota\x1b[0m')

const nota = lerXmlDaNota(notaCom(
  item('OL10W30', 'OLEO MOTOR 10W30 SEMISSINTETICO 1L', '27101932', '12.0000', '21.5000', '258.00') +
  item('PF-125', 'PASTILHA DE FREIO DIANTEIRA', '87141000', '2.0000', '21.0000', '42.00'),
))

confere('chave de acesso sai do atributo Id, sem o prefixo "NFe"', nota.chaveAcesso, CHAVE)
confere('número da nota', nota.numero, '169089')
confere('série', nota.serie, '1')
confere('data de emissão vira aaaa-mm-dd, sem hora nem fuso', nota.dataEmissao, '2026-08-15')
confere('natureza da operação', nota.naturezaOperacao, 'COMPRA PARA COMERCIALIZACAO')
confere('nome do fornecedor', nota.fornecedorNome, 'DISTRIBUIDORA DE PECAS SAO PAULO LTDA')
confere('CNPJ do fornecedor', nota.fornecedorCnpj, '55831184000638')
confere('valor total', nota.valorTotal, 300)
confere('base de cálculo do ICMS', nota.baseCalculoIcms, 250)
confere('valor do ICMS', nota.valorIcms, 45)

console.log('\n\x1b[1mOs itens\x1b[0m')

confere('a nota trouxe dois itens', nota.itens.length, 2)
confere('código do produto no fornecedor', nota.itens[0].codigo, 'OL10W30')
confere('descrição', nota.itens[0].descricao, 'OLEO MOTOR 10W30 SEMISSINTETICO 1L')
confere('NCM', nota.itens[0].ncm, '27101932')
confere('CFOP', nota.itens[0].cfop, '5102')
confere('unidade vem minúscula, como o cadastro usa', nota.itens[0].unidade, 'un')
confere('quantidade com casas decimais vira número', nota.itens[0].quantidade, 12)
confere('custo unitário', nota.itens[0].valorUnitario, 21.5)
confere('valor total do item', nota.itens[0].valorTotal, 258)
confere('o segundo item também', nota.itens[1].codigo, 'PF-125')

// Este é o caso que quebra parser de XML no mundo real: com um item só, a
// biblioteca devolveria objeto em vez de lista se ninguém dissesse o contrário.
console.log('\n\x1b[1mNota de um item só — a armadilha clássica\x1b[0m')
const umItem = lerXmlDaNota(notaCom(item('X1', 'FILTRO DE OLEO', '84212300', '1.0000', '18.90', '18.90')))
confere('continua sendo uma lista, não um objeto solto', umItem.itens.length, 1)
confere('e o item é lido igual', umItem.itens[0].descricao, 'FILTRO DE OLEO')

console.log('\n\x1b[1mXML sem o envelope de protocolo (NFe solta)\x1b[0m')
const solta = notaCom(item('X1', 'CABO DE VELA', '87141000', '3.0000', '10.00', '30.00'))
  .replace('<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">', '')
  .replace('<protNFe><infProt><cStat>100</cStat></infProt></protNFe>', '')
  .replace('</nfeProc>', '')
const semProtocolo = lerXmlDaNota(solta)
confere('lê igual quando a raiz é <NFe> direto', semProtocolo.numero, '169089')
confere('e os itens vêm junto', semProtocolo.itens[0].descricao, 'CABO DE VELA')

console.log('\n\x1b[1mArquivo errado\x1b[0m')
try {
  lerXmlDaNota('%PDF-1.4 isto aqui é um PDF, não um XML')
  erro('PDF é recusado', 'foi aceito')
} catch (e) {
  e instanceof XmlInvalido
    ? ok('PDF é recusado com mensagem em português', (e as Error).message)
    : erro('PDF recusado com erro errado', String(e))
}

try {
  lerXmlDaNota('<?xml version="1.0"?><outraCoisa><a>1</a></outraCoisa>')
  erro('XML que não é nota é recusado', 'foi aceito')
} catch (e) {
  e instanceof XmlInvalido
    ? ok('XML de outra coisa é recusado', (e as Error).message)
    : erro('XML errado recusado com erro errado', String(e))
}

console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
process.exit(falhou > 0 ? 1 : 0)
