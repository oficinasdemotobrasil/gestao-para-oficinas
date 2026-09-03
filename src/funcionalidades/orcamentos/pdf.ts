import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { moeda, exibirPlaca, data, telefone, cpfCnpj, quantidade as formatarQuantidade } from '@/lib/formato'
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
  let corpoDoNome = 18
  doc.setFontSize(corpoDoNome)
  while (corpoDoNome > 11 && doc.getTextWidth(oficina.nome) > espacoDoNome) {
    corpoDoNome -= 1
    doc.setFontSize(corpoDoNome)
  }
  // Ainda não coube nem no menor corpo: corta, porque quebrar em duas linhas
  // empurraria o resto do cabeçalho para baixo do endereço.
  let nomeVisivel = oficina.nome
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
    doc.text(oficina.endereco, MARGEM, y, { maxWidth: largura - MARGEM * 2 })
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
  doc.text(orcamento.cliente?.nome ?? '—', MARGEM, y)

  const modelo = [orcamento.moto?.marca, orcamento.moto?.modelo].filter(Boolean).join(' ')
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
      i.descricao,
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
        ? `Desconto (${orcamento.desconto_percentual}%)`
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
  if (orcamento.observacoes?.trim()) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...CINZA)
    doc.text('OBSERVAÇÕES', MARGEM, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...ESCURO)
    const linhas = doc.splitTextToSize(orcamento.observacoes.trim(), largura - MARGEM * 2)
    doc.text(linhas, MARGEM, y)
    y += linhas.length * 4.5 + 4
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
