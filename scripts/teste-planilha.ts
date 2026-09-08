/**
 * A planilha de exportação, conferida por um descompactador de verdade.
 *
 * Este teste existe porque o ZIP aqui é montado byte a byte, à mão. Um campo
 * errado no índice gera um arquivo que o meu próprio código lê sem reclamar e
 * que o computador da oficina recusa — o pior tipo de defeito, porque só
 * aparece na máquina de quem precisa dos dados, no dia em que ele está saindo.
 *
 * Por isso o teste grava o arquivo em disco e chama o `unzip` do sistema.
 *
 *   npm run teste:planilha
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { paraCsv, planilhaDaExportacao, nomeDoArquivoDaExportacao } from '../src/lib/planilha'

let passou = 0
let falhou = 0
const ok = (n: string, d = '') => { passou++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? ` (${d})` : ''}`) }
const erro = (n: string, d: string) => { falhou++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`) }

console.log('\n\x1b[1mCSV: o que o Excel brasileiro espera\x1b[0m')

const csv = paraCsv([
  { nome: 'Peça de "freio"', valor: 1234.56, obs: 'linha 1\nlinha 2', vazio: null },
  { nome: 'Serviço', valor: 90, extra: 'só nesta linha' },
])

csv.startsWith('﻿')
  ? ok('começa com BOM', 'sem ele o Excel lê UTF-8 como Latin-1 e "Serviço" vira "ServiÃ§o"')
  : erro('BOM', 'o arquivo não começa com a marca de UTF-8')

csv.includes('nome;valor;obs;vazio;extra')
  ? ok('separa por ponto e vírgula e reúne as colunas de todas as linhas')
  : erro('cabeçalho', csv.split('\r\n')[0])

csv.includes('"Peça de ""freio"""')
  ? ok('aspas dentro do campo são dobradas')
  : erro('aspas', 'campo com aspas não foi escapado')

csv.includes('"linha 1\nlinha 2"')
  ? ok('quebra de linha dentro do campo fica entre aspas')
  : erro('quebra de linha', 'campo com quebra não foi protegido')

paraCsv([]).length > 0
  ? ok('lista vazia gera arquivo vazio, e não erro')
  : erro('lista vazia', 'devolveu string vazia')

console.log('\n\x1b[1mZIP: aberto pelo descompactador do sistema\x1b[0m')

const pasta = mkdtempSync(path.join(tmpdir(), 'planilha-'))
try {
  const zip = planilhaDaExportacao({
    gerado_em: new Date().toISOString(),
    oficina: { nome: 'Oficina do Tião', cidade: 'Recife' },
    clientes: [
      { nome: 'Maria Aparecida', telefone: '81988887777' },
      { nome: 'José da Silva', telefone: '81977776666' },
    ],
    ordens_servico: [{ numero: 1, valor_total: 239.9 }],
    vazia: [],
  })

  const caminho = path.join(pasta, 'saida.zip')
  writeFileSync(caminho, Buffer.from(new Uint8Array(await zip.arrayBuffer())))

  // -t testa a integridade: é aqui que um índice mal montado aparece.
  const teste = execFileSync('unzip', ['-t', caminho], { encoding: 'utf8' })
  const integro = /No errors detected/.test(teste)
  integro
    ? ok('o unzip do sistema diz que o arquivo está íntegro')
    : erro('integridade', teste.trim().split('\n').slice(-2).join(' '))

  execFileSync('unzip', ['-o', '-q', caminho, '-d', pasta])

  const clientes = readFileSync(path.join(pasta, 'clientes.csv'), 'utf8')
  clientes.includes('Maria Aparecida') && clientes.includes('José da Silva')
    ? ok('clientes.csv sai com o conteúdo certo, e com acento inteiro')
    : erro('clientes.csv', clientes.slice(0, 80))

  const oficina = readFileSync(path.join(pasta, 'oficina.csv'), 'utf8')
  oficina.includes('Oficina do Tião')
    ? ok('oficina.csv também')
    : erro('oficina.csv', oficina.slice(0, 80))

  const lista = execFileSync('unzip', ['-Z1', caminho], { encoding: 'utf8' }).trim().split('\n')
  lista.includes('LEIA-ME.txt') && lista.includes('vazia.csv')
    ? ok(`os ${lista.length} arquivos esperados estão no pacote`, lista.join(', '))
    : erro('conteúdo do pacote', lista.join(', '))
} catch (e) {
  erro('montagem do zip', (e as Error).message)
} finally {
  rmSync(pasta, { recursive: true, force: true })
}

console.log('\n\x1b[1mNome do arquivo\x1b[0m')
const nome = nomeDoArquivoDaExportacao('Oficina do Tião & Filhos')
const nomeCerto = /^dados-oficina-do-tiao-filhos-\d{4}-\d{2}-\d{2}\.zip$/.test(nome)
nomeCerto
  ? ok('sem acento, sem espaço, com a data', nome)
  : erro('nome do arquivo', nome)

console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
process.exit(falhou > 0 ? 1 : 0)
