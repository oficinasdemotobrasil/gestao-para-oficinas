import { ArrowDown, ArrowUp, Scale } from 'lucide-react'
import { LinhaLista } from '@/componentes/ui/Card'
import { cn } from '@/lib/cn'
import { dataHora, quantidade as formatarQuantidade } from '@/lib/formato'
import type { TipoMovimentacao } from '@/tipos/banco'
import type { Movimentacao } from './api'

const aparencia: Record<
  TipoMovimentacao,
  { Icone: typeof ArrowDown; classe: string; sinal: string }
> = {
  entrada: { Icone: ArrowDown, classe: 'bg-sucesso-fundo text-sucesso', sinal: '+' },
  saida: { Icone: ArrowUp, classe: 'bg-erro-fundo text-erro', sinal: '−' },
  ajuste: { Icone: Scale, classe: 'bg-atencao-fundo text-atencao', sinal: '' },
}

/**
 * Uma linha do extrato. O sentido do lançamento se lê de duas formas ao mesmo
 * tempo — cor e seta —, porque cor sozinha não é informação para quem não
 * distingue verde de vermelho.
 */
export function LinhaMovimentacao({
  movimentacao,
  mostrarProduto = true,
  aoTocar,
}: {
  movimentacao: Movimentacao
  mostrarProduto?: boolean
  aoTocar?: () => void
}) {
  const { Icone, classe, sinal } = aparencia[movimentacao.tipo]
  const qtd = formatarQuantidade(Math.abs(movimentacao.quantidade))
  // No ajuste o sinal vem do próprio número, que pode ser negativo.
  const prefixo = movimentacao.tipo === 'ajuste' ? (movimentacao.quantidade < 0 ? '−' : '+') : sinal

  return (
    <LinhaLista
      inicio={
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-full', classe)}>
          <Icone aria-hidden size={20} />
        </span>
      }
      titulo={mostrarProduto ? movimentacao.produto_nome : (movimentacao.motivo ?? 'Sem motivo')}
      descricao={
        mostrarProduto
          ? `${movimentacao.motivo ?? 'Sem motivo'} · ${dataHora(movimentacao.criado_em)}`
          : `${dataHora(movimentacao.criado_em)}${
              movimentacao.usuario_nome ? ` · ${movimentacao.usuario_nome}` : ''
            }`
      }
      fim={
        <span className="shrink-0 text-corpo font-semibold text-claro">
          {prefixo}
          {qtd} {movimentacao.produto_unidade}
        </span>
      }
      aoTocar={aoTocar}
      comSeta={Boolean(aoTocar)}
    />
  )
}
