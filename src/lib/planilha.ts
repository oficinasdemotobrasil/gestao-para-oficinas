/**
 * Os dados da oficina em planilha, sem dependência nova.
 *
 * A saída é um .zip com um .csv por assunto — clientes, motos, ordens... É o
 * formato que o Excel e o Google Planilhas abrem sem instalar nada, e que
 * continua legível daqui a dez anos, quando este sistema talvez não exista mais.
 *
 * Por que não uma biblioteca de .xlsx: a mais conhecida saiu do npm e a versão
 * que ficou lá é antiga, com alerta de segurança. Trocar "0 vulnerabilidades"
 * por um arquivo mais bonito não é uma troca boa. O ZIP aqui tem 40 linhas.
 *
 * Detalhes que parecem manias e não são:
 *
 * - Separador ponto e vírgula, não vírgula. O Excel em português usa vírgula
 *   como decimal; com separador de vírgula, R$ 1.234,56 quebra em duas colunas.
 * - BOM no começo do arquivo. Sem ele o Excel abre UTF-8 como se fosse Latin-1,
 *   e "Serviço" vira "ServiÃ§o" — o defeito clássico de exportação no Brasil.
 */

const BOM = '﻿'

function celula(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'object') return JSON.stringify(valor)
  const texto = String(valor)
  // Aspas duplas dentro do campo dobram; o campo inteiro vai entre aspas se
  // tiver separador, aspas ou quebra de linha.
  if (/[";\n\r]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`
  return texto
}

/** Uma lista de objetos vira CSV, com o cabeçalho tirado das chaves. */
export function paraCsv(linhas: Record<string, unknown>[]): string {
  if (linhas.length === 0) return BOM
  // A união das chaves de todas as linhas: uma linha sem um campo opcional não
  // pode encolher a tabela inteira.
  const colunas: string[] = []
  for (const linha of linhas) {
    for (const chave of Object.keys(linha)) {
      if (!colunas.includes(chave)) colunas.push(chave)
    }
  }
  const corpo = linhas.map((l) => colunas.map((c) => celula(l[c])).join(';'))
  return BOM + [colunas.join(';'), ...corpo].join('\r\n')
}

/* ---------------------------------------------------------------------------
 * ZIP mínimo, sem compressão ("stored").
 *
 * Um .zip é: cada arquivo com seu cabeçalho, depois um índice, depois o rodapé
 * que diz onde o índice começa. Sem compressão não há algoritmo nenhum — só
 * montagem. O CRC-32 é a única conta, e é a mesma tabela que o PNG usa.
 * ------------------------------------------------------------------------- */

const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabela[n] = c >>> 0
  }
  return tabela
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export type ArquivoDaPlanilha = { nome: string; conteudo: string }

export function montarZip(arquivos: ArquivoDaPlanilha[]): Blob {
  const codificador = new TextEncoder()
  const pedacos: Uint8Array[] = []
  const indice: Uint8Array[] = []
  let deslocamento = 0

  const numero32 = (n: number) => {
    const b = new Uint8Array(4)
    new DataView(b.buffer).setUint32(0, n >>> 0, true)
    return b
  }
  const numero16 = (n: number) => {
    const b = new Uint8Array(2)
    new DataView(b.buffer).setUint16(0, n & 0xffff, true)
    return b
  }
  const juntar = (partes: Uint8Array[]) => {
    const total = partes.reduce((a, p) => a + p.length, 0)
    const saida = new Uint8Array(total)
    let i = 0
    for (const p of partes) {
      saida.set(p, i)
      i += p.length
    }
    return saida
  }

  for (const arquivo of arquivos) {
    const nome = codificador.encode(arquivo.nome)
    const dados = codificador.encode(arquivo.conteudo)
    const crc = crc32(dados)

    // Cabeçalho local: assinatura, versão, sinalizadores (bit 11 = nome em
    // UTF-8), método 0 (sem compressão), hora e data zeradas.
    const cabecalho = juntar([
      numero32(0x04034b50), numero16(20), numero16(0x0800), numero16(0),
      numero16(0), numero16(0),
      numero32(crc), numero32(dados.length), numero32(dados.length),
      numero16(nome.length), numero16(0), nome,
    ])
    pedacos.push(cabecalho, dados)

    indice.push(
      juntar([
        numero32(0x02014b50), numero16(20), numero16(20), numero16(0x0800), numero16(0),
        numero16(0), numero16(0),
        numero32(crc), numero32(dados.length), numero32(dados.length),
        numero16(nome.length), numero16(0), numero16(0), numero16(0), numero16(0),
        numero32(0), numero32(deslocamento), nome,
      ]),
    )
    deslocamento += cabecalho.length + dados.length
  }

  const indiceJunto = juntar(indice)
  const rodape = juntar([
    numero32(0x06054b50), numero16(0), numero16(0),
    numero16(arquivos.length), numero16(arquivos.length),
    numero32(indiceJunto.length), numero32(deslocamento), numero16(0),
  ])

  return new Blob([juntar(pedacos), indiceJunto, rodape], { type: 'application/zip' })
}

/**
 * O pacote que a função do banco devolve vira o .zip que a oficina baixa.
 * Cada chave de lista vira um arquivo; o resto entra em `oficina.csv`.
 */
export function planilhaDaExportacao(pacote: Record<string, unknown>): Blob {
  const arquivos: ArquivoDaPlanilha[] = []

  for (const [assunto, valor] of Object.entries(pacote)) {
    if (Array.isArray(valor)) {
      arquivos.push({
        nome: `${assunto}.csv`,
        conteudo: paraCsv(valor as Record<string, unknown>[]),
      })
    }
  }

  const dadosDaOficina = pacote.oficina
  if (dadosDaOficina && typeof dadosDaOficina === 'object') {
    arquivos.push({
      nome: 'oficina.csv',
      conteudo: paraCsv([dadosDaOficina as Record<string, unknown>]),
    })
  }

  arquivos.push({
    nome: 'LEIA-ME.txt',
    conteudo:
      'Exportação dos dados da oficina.\r\n\r\n' +
      `Gerado em ${new Date().toLocaleString('pt-BR')}.\r\n\r\n` +
      'Cada arquivo .csv abre no Excel ou no Google Planilhas.\r\n' +
      'O separador é ponto e vírgula, como o Excel em português espera.\r\n',
  })

  return montarZip(arquivos)
}

export function nomeDoArquivoDaExportacao(nomeDaOficina: string): string {
  const limpo = nomeDaOficina
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  const hoje = new Date().toISOString().slice(0, 10)
  return `dados-${limpo || 'oficina'}-${hoje}.zip`
}
