import type { jsPDF } from 'jspdf'
import { data, porcentagem } from '@/lib/formato'
import {
  novoDocumento,
  cabecalho,
  blocoClienteEMoto,
  tabelaDeItens,
  blocoDeTotais,
  blocoDeTexto,
  rodape,
} from '@/lib/pdfDocumento'
import type { Oficina } from '@/tipos/banco'
import type { OrcamentoCompleto } from './api'

/** O orçamento em uma folha, para mandar ao cliente ou imprimir no balcão. */
export function gerarPdfDoOrcamento(
  orcamento: OrcamentoCompleto,
  oficina: Oficina,
): jsPDF {
  const doc = novoDocumento()

  let y = cabecalho(doc, oficina, {
    titulo: 'Orçamento',
    numero: orcamento.numero,
    data: orcamento.criado_em,
  })

  y = blocoClienteEMoto(doc, y, {
    nome: orcamento.cliente?.nome,
    telefone: orcamento.cliente?.telefone,
    placa: orcamento.moto?.placa,
    modelo: [orcamento.moto?.marca, orcamento.moto?.modelo].filter(Boolean).join(' '),
    km: orcamento.km_registrado,
  })

  const itens = orcamento.itens.map((i) => ({
    tipo: i.tipo,
    descricao: i.descricao,
    quantidade: Number(i.quantidade),
    valor_unitario: Number(i.valor_unitario),
  }))
  y = tabelaDeItens(doc, y, itens)

  const soma = itens.reduce((a, i) => a + i.quantidade * i.valor_unitario, 0)
  y = blocoDeTotais(doc, y, {
    soma,
    desconto: Number(orcamento.desconto),
    rotuloDoDesconto:
      orcamento.desconto_percentual != null
        ? `Desconto (${porcentagem(orcamento.desconto_percentual)})`
        : 'Desconto',
    total: Number(orcamento.valor_total),
  })

  y = blocoDeTexto(doc, y, 'OBSERVAÇÕES', orcamento.observacoes ?? '')

  rodape(
    doc,
    y,
    orcamento.validade_ate ? `Válido até ${data(orcamento.validade_ate)}` : null,
    `Garantia de ${orcamento.garantia_dias} dias sobre os serviços executados.`,
  )

  return doc
}

export function nomeDoArquivo(orcamento: OrcamentoCompleto): string {
  const numero = String(orcamento.numero).padStart(4, '0')
  const placa = orcamento.moto?.placa ?? 'sem-placa'
  return `orcamento-${numero}-${placa}.pdf`
}
