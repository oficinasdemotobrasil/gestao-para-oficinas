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
import type { OrdemCompleta } from './api'

/**
 * A ordem de serviço em uma folha — o documento que sai junto com a moto.
 *
 * Mostra a observação TÉCNICA, e não a do orçamento: aquela é o texto de venda
 * que o cliente já leu, e no comprovante do serviço ela não diz nada sobre o
 * que foi feito.
 */
export function gerarPdfDaOrdem(ordem: OrdemCompleta, oficina: Oficina): jsPDF {
  const doc = novoDocumento()

  let y = cabecalho(doc, oficina, {
    titulo: 'Ordem de Serviço',
    numero: ordem.numero,
    data: ordem.data_abertura,
  })

  y = blocoClienteEMoto(doc, y, {
    nome: ordem.cliente?.nome,
    telefone: ordem.cliente?.telefone,
    placa: ordem.moto?.placa,
    modelo: [ordem.moto?.marca, ordem.moto?.modelo].filter(Boolean).join(' '),
    km: ordem.km_entrada,
  })

  const itens = ordem.itens.map((i) => ({
    tipo: i.tipo,
    descricao: i.descricao,
    quantidade: Number(i.quantidade),
    valor_unitario: Number(i.valor_unitario),
  }))
  y = tabelaDeItens(doc, y, itens)

  const soma = itens.reduce((a, i) => a + i.quantidade * i.valor_unitario, 0)
  y = blocoDeTotais(doc, y, {
    soma,
    desconto: Math.max(soma - Number(ordem.valor_total), 0),
    rotuloDoDesconto:
      ordem.desconto_tipo === 'percentual'
        ? `Desconto (${porcentagem(ordem.desconto)})`
        : 'Desconto',
    total: Number(ordem.valor_total),
  })

  y = blocoDeTexto(doc, y, 'SERVIÇO EXECUTADO', ordem.observacoes_tecnicas ?? '')

  const conclusao = ordem.data_conclusao
    ? `Concluída em ${data(ordem.data_conclusao)}`
    : null

  rodape(
    doc,
    y,
    conclusao,
    ordem.garantia_ate
      ? `Garantia sobre os serviços executados até ${data(ordem.garantia_ate)}.`
      : 'Garantia sobre os serviços executados conforme combinado.',
  )

  return doc
}

export function nomeDoArquivoDaOrdem(ordem: OrdemCompleta): string {
  const numero = String(ordem.numero).padStart(4, '0')
  const placa = ordem.moto?.placa ?? 'sem-placa'
  return `ordem-de-servico-${numero}-${placa}.pdf`
}
