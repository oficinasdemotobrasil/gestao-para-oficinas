import type { jsPDF } from 'jspdf'
import { data, exibirPlaca, moeda, quilometragem } from '@/lib/formato'
import {
  novoDocumento,
  cabecalho,
  blocoDeTexto,
  rodape,
  MARGEM,
  garantirEspaco,
  paraPdf,
} from '@/lib/pdfDocumento'
import type { Moto, Oficina } from '@/tipos/banco'
import type { ServicoNoHistorico } from './api'

/**
 * O histórico completo da placa, em papel.
 *
 * Serve para entregar junto com a moto quando ela é vendida: o comprador leva a
 * ficha do que já foi feito. Por isso ele traz o nome de quem era o dono na
 * época e nada mais sobre ele — o histórico é da moto, os dados pessoais não.
 */
export function gerarPdfDoHistorico(
  moto: Pick<Moto, 'placa' | 'marca' | 'modelo' | 'ano' | 'km_atual'>,
  servicos: ServicoNoHistorico[],
  oficina: Oficina,
): jsPDF {
  const doc = novoDocumento()

  let y = cabecalho(doc, oficina, {
    titulo: 'Histórico da placa',
    numero: 0,
    data: new Date().toISOString(),
  })

  // O número no cabeçalho não faz sentido aqui: o documento é da moto.
  doc.setFillColor(255, 255, 255)
  doc.rect(120, MARGEM, 80, 14, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(17, 17, 19)
  doc.text(exibirPlaca(moto.placa), 200 - MARGEM, MARGEM + 6, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(107, 107, 112)
  doc.text(data(new Date()), 200 - MARGEM, MARGEM + 11, { align: 'right' })

  const descricao = [
    paraPdf([moto.marca, moto.modelo].filter(Boolean).join(' ')),
    moto.ano ? String(moto.ano) : null,
    moto.km_atual ? quilometragem(moto.km_atual) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  doc.setFontSize(10)
  doc.setTextColor(17, 17, 19)
  doc.text(descricao || '—', MARGEM, y)
  y += 8

  if (servicos.length === 0) {
    y = blocoDeTexto(doc, y, 'HISTÓRICO', 'Nenhum serviço concluído nesta placa até hoje.')
  }

  for (const s of servicos) {
    y = garantirEspaco(doc, y, 30)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(17, 17, 19)
    doc.text(`OS ${String(s.numero).padStart(4, '0')} — ${data(s.data)}`, MARGEM, y)
    doc.text(moeda(s.valor), 200 - MARGEM, y, { align: 'right' })
    y += 5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(107, 107, 112)
    const linha = [
      s.km ? quilometragem(s.km) : null,
      s.dono_na_epoca ? `dono na época: ${paraPdf(s.dono_na_epoca)}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
    if (linha) {
      doc.text(linha, MARGEM, y)
      y += 5
    }

    const itens = [
      ...s.servicos.map((d) => ({ tipo: 'servico' as const, descricao: d, quantidade: 1, valor_unitario: 0 })),
      ...s.pecas.map((d) => ({ tipo: 'produto' as const, descricao: d, quantidade: 1, valor_unitario: 0 })),
    ]
    if (itens.length > 0) {
      doc.setTextColor(17, 17, 19)
      const texto = paraPdf(itens.map((i) => i.descricao).join(' · '))
      const linhas: string[] = doc.splitTextToSize(texto, 200 - MARGEM * 2)
      for (const l of linhas) {
        y = garantirEspaco(doc, y, 0)
        doc.text(l, MARGEM, y)
        y += 4.5
      }
    }

    y += 4
    doc.setDrawColor(230, 230, 233)
    doc.line(MARGEM, y - 2, 200 - MARGEM, y - 2)
    y += 2
  }

  rodape(
    doc,
    y,
    `${servicos.length} ${servicos.length === 1 ? 'serviço concluído' : 'serviços concluídos'} nesta placa`,
    'O histórico segue a moto. Os dados pessoais de donos anteriores não constam neste documento.',
  )

  return doc
}

export function nomeDoArquivoDoHistorico(placa: string): string {
  return `historico-${placa}.pdf`
}
