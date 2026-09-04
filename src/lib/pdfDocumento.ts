import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  moeda,
  exibirPlaca,
  data as formatarData,
  telefone,
  cpfCnpj,
  quantidade as formatarQuantidade,
} from '@/lib/formato'
import type { Oficina } from '@/tipos/banco'

/**
 * As peças comuns dos documentos que a oficina entrega: orçamento e ordem de
 * serviço. Os dois têm o mesmo cabeçalho, a mesma tabela e o mesmo rodapé — e
 * mantidos em arquivos separados iam divergir na primeira correção feita só de
 * um lado.
 *
 * Tudo é gerado no navegador. Sem servidor, sem custo por documento, e funciona
 * com a internet oscilando: os dados já estão na tela quando o botão é tocado.
 */

/** Cores do DESIGN.md. O jsPDF não entende variável CSS, então elas voltam aqui. */
const AMARELO: [number, number, number] = [245, 197, 24]
const ESCURO: [number, number, number] = [17, 17, 19]
const CINZA: [number, number, number] = [107, 107, 112]
const LINHA: [number, number, number] = [230, 230, 233]

export const MARGEM = 14
/** Onde o conteúdo tem de parar para não invadir o rodapé. */
const LIMITE_DA_PAGINA = 34

/**
 * Tira do texto o que a fonte do PDF não sabe desenhar.
 *
 * As fontes padrão do jsPDF escrevem no alfabeto WinAnsi — acento, cedilha e
 * travessão entram; emoji, não. E o estrago não é só o símbolo errado: o jsPDF
 * erra a medida da linha que contém o caractere desconhecido, a quebra
 * automática não acontece e a frase sai pela borda com as letras espaçadas.
 * Foi o que apareceu num orçamento cujo texto a IA terminou com um emoji.
 */
const FORA_DA_FONTE =
  /[^\n\x20-\x7E -ÿŒœŠšŸŽžƒˆ˜–—‘’‚“”„†‡•…‰‹›€™]/g

export function paraPdf(texto: string | null | undefined): string {
  if (!texto) return ''
  return texto
    .normalize('NFC')
    .replace(FORA_DA_FONTE, '')
    // O emoji costuma vir depois de um espaço; sem isto sobra o espaço solto.
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

export function novoDocumento(): jsPDF {
  return new jsPDF({ unit: 'mm', format: 'a4' })
}

export const larguraDe = (doc: jsPDF) => doc.internal.pageSize.getWidth()
export const alturaDe = (doc: jsPDF) => doc.internal.pageSize.getHeight()

/** Abre outra página quando o que vem a seguir não cabe. */
export function garantirEspaco(doc: jsPDF, y: number, precisaDe: number): number {
  if (y + precisaDe > alturaDe(doc) - LIMITE_DA_PAGINA) {
    doc.addPage()
    return MARGEM + 6
  }
  return y
}

export interface Identificacao {
  /** "Orçamento" ou "Ordem de Serviço". */
  titulo: string
  numero: number
  /** A data que identifica o documento: emissão ou abertura. */
  data: string
}

export function cabecalho(doc: jsPDF, oficina: Oficina, id: Identificacao): number {
  const largura = larguraDe(doc)
  let y = MARGEM

  doc.setFillColor(...AMARELO)
  doc.rect(0, 0, largura, 4, 'F')

  // O número é desenhado à direita, na mesma faixa. O nome da oficina recebe só
  // o que sobra: sem isto, "Oficina do Zé Motopeças e Serviços Ltda" passa por
  // cima do número.
  const rotuloNumero = `${id.titulo} nº ${String(id.numero).padStart(4, '0')}`
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  const espacoDoNome = largura - MARGEM * 2 - doc.getTextWidth(rotuloNumero) - 8

  y += 6
  doc.setTextColor(...ESCURO)
  const nome = paraPdf(oficina.nome)
  let corpo = 18
  doc.setFontSize(corpo)
  while (corpo > 11 && doc.getTextWidth(nome) > espacoDoNome) {
    corpo -= 1
    doc.setFontSize(corpo)
  }
  // Ainda não coube nem no menor corpo: corta, porque quebrar em duas linhas
  // empurraria o resto do cabeçalho para baixo do endereço.
  let visivel = nome
  if (doc.getTextWidth(visivel) > espacoDoNome) {
    while (visivel.length > 4 && doc.getTextWidth(`${visivel}…`) > espacoDoNome) {
      visivel = visivel.slice(0, -1)
    }
    visivel = `${visivel.trimEnd()}…`
  }
  doc.text(visivel, MARGEM, y)

  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...CINZA)

  const contato = [
    oficina.telefone ? telefone(oficina.telefone) : null,
    oficina.cnpj ? `CNPJ ${cpfCnpj(oficina.cnpj)}` : null,
  ].filter(Boolean)
  if (contato.length) {
    doc.text(contato.join('  ·  '), MARGEM, y)
    y += 4
  }
  if (oficina.endereco) {
    doc.text(paraPdf(oficina.endereco), MARGEM, y, { maxWidth: largura - MARGEM * 2 })
    y += 4
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...ESCURO)
  doc.text(rotuloNumero, largura - MARGEM, MARGEM + 6, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...CINZA)
  doc.text(formatarData(id.data), largura - MARGEM, MARGEM + 11, { align: 'right' })

  y += 4
  doc.setDrawColor(...LINHA)
  doc.line(MARGEM, y, largura - MARGEM, y)
  return y + 8
}

export interface DadosDoCliente {
  nome: string | null | undefined
  telefone: string | null | undefined
  placa: string | null | undefined
  modelo: string
  km: number | null
}

export function blocoClienteEMoto(doc: jsPDF, y: number, d: DadosDoCliente): number {
  const meio = larguraDe(doc) / 2

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...CINZA)
  doc.text('CLIENTE', MARGEM, y)
  doc.text('MOTO', meio, y)

  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...ESCURO)
  doc.text(paraPdf(d.nome) || '—', MARGEM, y)
  doc.text(d.placa ? exibirPlaca(d.placa) : '—', meio, y)

  y += 5
  doc.setFontSize(9)
  doc.setTextColor(...CINZA)
  if (d.telefone) doc.text(telefone(d.telefone), MARGEM, y)
  if (d.modelo) doc.text(paraPdf(d.modelo), meio, y)

  if (d.km) {
    y += 4.5
    doc.text(`${new Intl.NumberFormat('pt-BR').format(d.km)} km`, meio, y)
  }

  return y + 8
}

export interface ItemDoDocumento {
  tipo: 'produto' | 'servico' | 'avulso'
  descricao: string
  quantidade: number
  valor_unitario: number
}

const ROTULO_DO_TIPO = { produto: 'Peça', servico: 'Serviço', avulso: 'Item' }

export function tabelaDeItens(doc: jsPDF, y: number, itens: ItemDoDocumento[]): number {
  autoTable(doc, {
    startY: y,
    head: [['Descrição', 'Tipo', 'Qtd.', 'Valor un.', 'Total']],
    body: itens.map((i) => [
      paraPdf(i.descricao),
      ROTULO_DO_TIPO[i.tipo],
      formatarQuantidade(i.quantidade),
      moeda(i.valor_unitario),
      moeda(i.quantidade * i.valor_unitario),
    ]),
    margin: { left: MARGEM, right: MARGEM },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, textColor: ESCURO },
    headStyles: { fillColor: ESCURO, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 251] },
    columnStyles: {
      1: { cellWidth: 20 },
      2: { cellWidth: 16, halign: 'right' },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },
  })

  // A tipagem do plugin não expõe lastAutoTable, mas ele existe em tempo de
  // execução — é como o próprio jspdf-autotable indica a posição final.
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
}

export interface Totais {
  soma: number
  desconto: number
  rotuloDoDesconto: string
  total: number
}

export function blocoDeTotais(doc: jsPDF, y: number, t: Totais): number {
  const largura = larguraDe(doc)
  const colunaValor = largura - MARGEM
  const colunaRotulo = largura - MARGEM - 45

  // Com muitos itens a tabela vira a página, e o total cairia rodapé abaixo — o
  // número mais importante do documento, cortado.
  y = garantirEspaco(doc, y, 40)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...CINZA)
  doc.text('Soma dos itens', colunaRotulo, y, { align: 'right' })
  doc.setTextColor(...ESCURO)
  doc.text(moeda(t.soma), colunaValor, y, { align: 'right' })

  if (t.desconto > 0) {
    y += 6
    doc.setTextColor(...CINZA)
    doc.text(t.rotuloDoDesconto, colunaRotulo, y, { align: 'right' })
    doc.setTextColor(...ESCURO)
    doc.text(`- ${moeda(t.desconto)}`, colunaValor, y, { align: 'right' })
  }

  // O total é o número que a pessoa procura primeiro: fundo amarelo e corpo
  // grande, como na tela.
  y += 4
  doc.setFillColor(...AMARELO)
  doc.roundedRect(colunaRotulo - 12, y, largura - MARGEM - colunaRotulo + 12, 14, 2, 2, 'F')
  y += 9
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...ESCURO)
  doc.text('TOTAL', colunaRotulo - 6, y)
  doc.setFontSize(14)
  doc.text(moeda(t.total), colunaValor - 3, y, { align: 'right' })

  return y + 14
}

/** Um título pequeno em cinza e o texto embaixo, virando a página se precisar. */
export function blocoDeTexto(doc: jsPDF, y: number, titulo: string, texto: string): number {
  const limpo = paraPdf(texto)
  if (!limpo) return y

  const largura = larguraDe(doc)
  y = garantirEspaco(doc, y, 12)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...CINZA)
  doc.text(titulo, MARGEM, y)
  y += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...ESCURO)

  // Uma linha por vez, e não o bloco inteiro: um texto comprido desenhado de
  // uma vez continua descendo depois do fim da página, e some.
  const linhas: string[] = doc.splitTextToSize(limpo, largura - MARGEM * 2)
  for (const linha of linhas) {
    y = garantirEspaco(doc, y, 0)
    doc.text(linha, MARGEM, y)
    y += 4.5
  }
  return y + 4
}

/** Duas linhas no pé da última página: a primeira em negrito. */
export function rodape(doc: jsPDF, y: number, destaque: string | null, apoio: string): void {
  const largura = larguraDe(doc)
  const yRodape = Math.max(y + 6, alturaDe(doc) - 24)

  doc.setDrawColor(...LINHA)
  doc.line(MARGEM, yRodape - 6, largura - MARGEM, yRodape - 6)

  if (destaque) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...ESCURO)
    doc.text(destaque, MARGEM, yRodape)
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...CINZA)
  doc.text(apoio, MARGEM, yRodape + 5)
}
