import type { jsPDF } from 'jspdf'
import { data, dataHora, porcentagem } from '@/lib/formato'
import {
  novoDocumento,
  cabecalho,
  blocoClienteEMoto,
  tabelaDeItens,
  blocoDeTotais,
  blocoDeTexto,
  blocoDeFotos,
  blocoDeVistoria,
  rodape,
  type FotoDoDocumento,
} from '@/lib/pdfDocumento'
import { ITENS_DA_VISTORIA, NIVEIS_DE_COMBUSTIVEL } from '@/funcionalidades/fotos/vistoria'
import type { Oficina, OsVistoria } from '@/tipos/banco'
import type { OrdemCompleta } from './api'

/**
 * A ordem de serviço em uma folha — o documento que sai junto com a moto.
 *
 * Mostra a observação TÉCNICA, e não a do orçamento: aquela é o texto de venda
 * que o cliente já leu, e no comprovante do serviço ela não diz nada sobre o
 * que foi feito.
 */
export async function gerarPdfDaOrdem(
  ordem: OrdemCompleta,
  oficina: Oficina,
  registro: {
    fotos?: FotoDoDocumento[]
    vistoria?: OsVistoria | null
    /** Desconto dado na hora de receber (0083), com o motivo. */
    descontoNoPagamento?: { valor: number; motivo: string | null } | null
  } = {},
): Promise<jsPDF> {
  const doc = novoDocumento()

  let y = await cabecalho(doc, oficina, {
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
  // O desconto do orçamento e, se houve, o da hora de receber — este não muda
  // a ordem (o que foi aprovado fica como foi aprovado), só o que se pagou.
  const noPagamento = Number(registro.descontoNoPagamento?.valor ?? 0)
  y = blocoDeTotais(doc, y, {
    soma,
    desconto: Math.max(soma - Number(ordem.valor_total), 0),
    rotuloDoDesconto:
      ordem.desconto_tipo === 'percentual'
        ? `Desconto (${porcentagem(ordem.desconto)})`
        : 'Desconto',
    descontoNoPagamento: noPagamento > 0 ? registro.descontoNoPagamento : null,
    total: Number(ordem.valor_total) - noPagamento,
  })

  y = blocoDeTexto(doc, y, 'SERVIÇO EXECUTADO', ordem.observacoes_tecnicas ?? '')

  // Como a moto chegou, e depois as fotos: é o cliente vendo, no mesmo papel
  // que diz quanto custou, o estado em que deixou a moto e a peça trocada.
  const vistoria = registro.vistoria
  if (vistoria) {
    y = blocoDeVistoria(doc, y, {
      feitaEm: dataHora(vistoria.feita_em),
      itens: ITENS_DA_VISTORIA.filter((i) => vistoria.itens[i.chave]).map((i) => ({
        rotulo: i.rotulo,
        avaria: vistoria.itens[i.chave] === 'avaria',
      })),
      combustivel:
        NIVEIS_DE_COMBUSTIVEL.find((n) => n.valor === vistoria.combustivel)?.rotulo ?? null,
      pertences: vistoria.pertences,
      observacoes: vistoria.observacoes,
    })
  }
  y = blocoDeFotos(doc, y, registro.fotos ?? [])

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
