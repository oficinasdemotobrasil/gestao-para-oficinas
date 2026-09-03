import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  moeda,
  exibirPlaca,
  data,
  telefone,
  cpfCnpj,
  porcentagem,
  quantidade as formatarQuantidade,
} from '@/lib/formato'
import type { Oficina } from '@/tipos/banco'
import type { OrcamentoCompleto } from './api'

/**
 * Gera o PDF no próprio navegador — sem servidor, sem custo por documento, e
 * funciona mesmo se a oficina estiver com a internet oscilando: os dados já
 * estão na tela quando o botão é tocado.
 *
 * As cores vêm do DESIGN.md. O jsPDF não entende variável CSS, então elas são
 * repetidas aqui como números — é o único lugar do projeto onde isso acontece,
 * e está isolado neste arquivo.
 */
const AMARELO: [number, number, number] = [245, 197, 24]
const ESCURO: [number, number, number] = [17, 17, 19]
const CINZA: [number, number, number] = [107, 107, 112]

const MARGEM = 14

/**
 * Tira do texto o que a fonte do PDF não sabe desenhar.
 *
 * As fontes padrão do jsPDF (helvetica e companhia) escrevem no alfabeto
 * WinAnsi — acento, cedilha e travessão entram; emoji, não. E o estrago não é
 * só o símbolo errado: o jsPDF erra a medida da linha que contém o caractere
 * desconhecido, a quebra automática não acontece e a frase sai pela borda da
 * página, com as letras espaçadas. Foi exatamente o que apareceu no rodapé de
 * um orçamento cujo texto a IA terminou com um emoji.
 *
 * O emoji continua inteiro no WhatsApp, que sabe mostrá-lo. Aqui ele some, e é
 * a decisão certa: melhor a frase limpa do que a frase quebrada.
 */
const FORA_DA_FONTE =
  // eslint-disable-next-line no-control-regex
  /[^\n\x20-\x7E\u00A0-\u00FF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]/g

function paraPdf(texto: string | null | undefined): string {
  if (!texto) return ''
  return (
    texto
      .normalize('NFC')
      .replace(FORA_DA_FONTE, '')
      // O emoji costuma vir depois de um espaço; sem isto sobra o espaço solto.
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .trim()
  )
}

export function gerarPdfDoOrcamento(
  orcamento: OrcamentoCompleto,
  oficina: Oficina,
): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const largura = doc.internal.pageSize.getWidth()
  let y = MARGEM

  // --- Cabeçalho: quem está mandando o orçamento ---------------------------
  doc.setFillColor(...AMARELO)
  doc.rect(0, 0, largura, 4, 'F')

  // O número do orçamento é desenhado à direita, na mesma faixa. O nome da
  // oficina recebe só o que sobra: sem isto, "Oficina do Zé Motopeças e
  // Serviços Ltda" passa por cima do número.
  const rotuloNumero = `Orçamento nº ${String(orcamento.numero).padStart(4, '0')}`
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  const larguraNumero = doc.getTextWidth(rotuloNumero)
  const espacoDoNome = largura - MARGEM * 2 - larguraNumero - 8

  y += 6
  doc.setTextColor(...ESCURO)
  const nomeDaOficina = paraPdf(oficina.nome)
  let corpoDoNome = 18
  doc.setFontSize(corpoDoNome)
  while (corpoDoNome > 11 && doc.getTextWidth(nomeDaOficina) > espacoDoNome) {
    corpoDoNome -= 1
    doc.setFontSize(corpoDoNome)
  }
  // Ainda não coube nem no menor corpo: corta, porque quebrar em duas linhas
  // empurraria o resto do cabeçalho para baixo do endereço.
  let nomeVisivel = nomeDaOficina
  if (doc.getTextWidth(nomeVisivel) > espacoDoNome) {
    while (nomeVisivel.length > 4 && doc.getTextWidth(`${nomeVisivel}…`) > espacoDoNome) {
      nomeVisivel = nomeVisivel.slice(0, -1)
    }
    nomeVisivel = `${nomeVisivel.trimEnd()}…`
  }
  doc.text(nomeVisivel, MARGEM, y)

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

  // Número do orçamento, alinhado à direita do cabeçalho.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...ESCURO)
  doc.text(rotuloNumero, largura - MARGEM, MARGEM + 6, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...CINZA)
  doc.text(data(orcamento.criado_em), largura - MARGEM, MARGEM + 11, { align: 'right' })

  y += 4
  doc.setDrawColor(230, 230, 233)
  doc.line(MARGEM, y, largura - MARGEM, y)
  y += 8

  // --- Cliente e moto, lado a lado -----------------------------------------
  const meio = largura / 2
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...CINZA)
  doc.text('CLIENTE', MARGEM, y)
  doc.text('MOTO', meio, y)

  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...ESCURO)
  doc.text(paraPdf(orcamento.cliente?.nome) || '—', MARGEM, y)

  const modelo = paraPdf([orcamento.moto?.marca, orcamento.moto?.modelo].filter(Boolean).join(' '))
  doc.text(orcamento.moto ? exibirPlaca(orcamento.moto.placa) : '—', meio, y)

  y += 5
  doc.setFontSize(9)
  doc.setTextColor(...CINZA)
  if (orcamento.cliente?.telefone) doc.text(telefone(orcamento.cliente.telefone), MARGEM, y)
  if (modelo) doc.text(modelo, meio, y)

  if (orcamento.km_registrado) {
    y += 4.5
    doc.text(
      `${new Intl.NumberFormat('pt-BR').format(orcamento.km_registrado)} km`,
      meio,
      y,
    )
  }

  y += 8

  // --- Tabela de itens ------------------------------------------------------
  const rotuloDoTipo = { produto: 'Peça', servico: 'Serviço', avulso: 'Item' }

  autoTable(doc, {
    startY: y,
    head: [['Descrição', 'Tipo', 'Qtd.', 'Valor un.', 'Total']],
    body: orcamento.itens.map((i) => [
      paraPdf(i.descricao),
      rotuloDoTipo[i.tipo],
      formatarQuantidade(Number(i.quantidade)),
      moeda(Number(i.valor_unitario)),
      moeda(Number(i.quantidade) * Number(i.valor_unitario)),
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
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

  // --- Desconto e total -----------------------------------------------------
  const soma = orcamento.itens.reduce(
    (a, i) => a + Number(i.quantidade) * Number(i.valor_unitario),
    0,
  )
  const colunaValor = largura - MARGEM
  const colunaRotulo = largura - MARGEM - 45

  // Com muitos itens a tabela vira a página, e o total cairia rodapé abaixo —
  // o número mais importante do documento, cortado. Melhor abrir outra página.
  const ALTURA_DO_FECHAMENTO = 40
  if (y + ALTURA_DO_FECHAMENTO > doc.internal.pageSize.getHeight() - 24) {
    doc.addPage()
    y = MARGEM + 6
  }

  doc.setFontSize(10)
  doc.setTextColor(...CINZA)
  doc.setFont('helvetica', 'normal')
  doc.text('Soma dos itens', colunaRotulo, y, { align: 'right' })
  doc.setTextColor(...ESCURO)
  doc.text(moeda(soma), colunaValor, y, { align: 'right' })

  if (Number(orcamento.desconto) > 0) {
    y += 6
    doc.setTextColor(...CINZA)
    const rotuloDesconto =
      orcamento.desconto_percentual != null
        ? `Desconto (${porcentagem(orcamento.desconto_percentual)})`
        : 'Desconto'
    doc.text(rotuloDesconto, colunaRotulo, y, { align: 'right' })
    doc.setTextColor(...ESCURO)
    doc.text(`- ${moeda(Number(orcamento.desconto))}`, colunaValor, y, { align: 'right' })
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
  doc.text(moeda(Number(orcamento.valor_total)), colunaValor - 3, y, { align: 'right' })

  y += 14

  // --- Observações ----------------------------------------------------------
  const observacoes = paraPdf(orcamento.observacoes)
  if (observacoes) {
    const ALTURA_LINHA = 4.5
    const LIMITE = doc.internal.pageSize.getHeight() - 34

    if (y + 12 > LIMITE) {
      doc.addPage()
      y = MARGEM + 6
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...CINZA)
    doc.text('OBSERVAÇÕES', MARGEM, y)
    y += 5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...ESCURO)

    // Uma linha por vez, e não o bloco inteiro de uma vez: um texto comprido
    // desenhado em bloco continua descendo depois do fim da página, e some.
    const linhas: string[] = doc.splitTextToSize(observacoes, largura - MARGEM * 2)
    for (const linha of linhas) {
      if (y > LIMITE) {
        doc.addPage()
        y = MARGEM + 6
      }
      doc.text(linha, MARGEM, y)
      y += ALTURA_LINHA
    }
    y += 4
  }

  // --- Rodapé: validade e garantia -----------------------------------------
  const alturaPagina = doc.internal.pageSize.getHeight()
  const yRodape = Math.max(y + 6, alturaPagina - 24)

  doc.setDrawColor(230, 230, 233)
  doc.line(MARGEM, yRodape - 6, largura - MARGEM, yRodape - 6)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...ESCURO)
  if (orcamento.validade_ate) {
    doc.text(`Válido até ${data(orcamento.validade_ate)}`, MARGEM, yRodape)
  }
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...CINZA)
  doc.text(
    `Garantia de ${orcamento.garantia_dias} dias sobre os serviços executados.`,
    MARGEM,
    yRodape + 5,
  )

  return doc
}

export function nomeDoArquivo(orcamento: OrcamentoCompleto): string {
  const numero = String(orcamento.numero).padStart(4, '0')
  const placa = orcamento.moto?.placa ?? 'sem-placa'
  return `orcamento-${numero}-${placa}.pdf`
}
