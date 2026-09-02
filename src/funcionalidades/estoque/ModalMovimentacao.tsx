import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Scale } from 'lucide-react'
import { Modal } from '@/componentes/ui/Modal'
import { Botao } from '@/componentes/ui/Botao'
import { Campo } from '@/componentes/ui/Campo'
import { Contador } from '@/componentes/ui/Contador'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { paraNumero } from '@/lib/numero'
import { quantidade as formatarQuantidade } from '@/lib/formato'
import type { TipoMovimentacao } from '@/tipos/banco'
import { registrarMovimentacao } from './api'

interface Props {
  aberto: boolean
  aoFechar: () => void
  tipo: TipoMovimentacao
  produto: { id: string; nome: string; unidade: string; estoque_atual: number }
}

const titulos: Record<TipoMovimentacao, string> = {
  entrada: 'Entrada no estoque',
  saida: 'Saída do estoque',
  ajuste: 'Ajustar estoque',
}

/** Motivos que cobrem quase todo lançamento do dia. Um toque em vez de digitar. */
const sugestoes: Record<TipoMovimentacao, string[]> = {
  entrada: ['Compra no fornecedor', 'Devolução do cliente', 'Sobra de serviço'],
  saida: ['Usado no serviço', 'Venda no balcão', 'Peça danificada'],
  ajuste: ['Contagem do estoque', 'Perda', 'Correção de lançamento'],
}

export function ModalMovimentacao({ aberto, aoFechar, tipo, produto }: Props) {
  const toast = useToast()
  const cache = useQueryClient()
  const [valor, setValor] = useState('1')
  const [motivo, setMotivo] = useState('')
  const [erroGeral, setErroGeral] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    // No ajuste o campo começa com o saldo de hoje: a pessoa corrige o número
    // que está vendo, em vez de calcular a diferença de cabeça.
    setValor(tipo === 'ajuste' ? formatarQuantidade(produto.estoque_atual) : '1')
    setMotivo('')
    setErroGeral(null)
  }, [aberto, tipo, produto.estoque_atual])

  const digitado = paraNumero(valor)
  const diferenca = digitado - produto.estoque_atual
  const saldoPrevisto =
    tipo === 'entrada'
      ? produto.estoque_atual + digitado
      : tipo === 'saida'
        ? produto.estoque_atual - digitado
        : digitado

  const salvar = useMutation({
    mutationFn: () =>
      registrarMovimentacao({
        produtoId: produto.id,
        tipo,
        // Ajuste é gravado como diferença: assim o saldo continua sendo a soma
        // do extrato, que é a regra do banco. A pessoa digita o total real.
        quantidade: tipo === 'ajuste' ? diferenca : digitado,
        motivo: motivo.trim(),
      }),
    onSuccess: (novoSaldo) => {
      void cache.invalidateQueries({ queryKey: ['produtos'] })
      void cache.invalidateQueries({ queryKey: ['produto', produto.id] })
      void cache.invalidateQueries({ queryKey: ['movimentacoes'] })
      void cache.invalidateQueries({ queryKey: ['repor'] })
      toast.sucesso(`Estoque de ${produto.nome}: ${formatarQuantidade(novoSaldo)} ${produto.unidade}.`)
      aoFechar()
    },
    onError: (e) => setErroGeral(traduzirErro(e)),
  })

  function enviar() {
    setErroGeral(null)

    if (!Number.isFinite(digitado)) {
      return setErroGeral('Informe uma quantidade válida.')
    }
    if (tipo !== 'ajuste' && digitado <= 0) {
      return setErroGeral('A quantidade precisa ser maior que zero.')
    }
    if (tipo === 'ajuste' && diferenca === 0) {
      return setErroGeral('O estoque já está nesse número. Nada a ajustar.')
    }
    if (tipo === 'ajuste' && digitado < 0) {
      return setErroGeral('O estoque não pode ficar negativo.')
    }
    if (!motivo.trim()) {
      return setErroGeral('Informe o motivo. É ele que explica o lançamento depois.')
    }
    salvar.mutate()
  }

  const Icone = tipo === 'entrada' ? ArrowDown : tipo === 'saida' ? ArrowUp : Scale

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={titulos[tipo]}
      rodape={
        <Botao largo carregando={salvar.isPending} onClick={enviar} icone={<Icone aria-hidden size={20} />}>
          {tipo === 'entrada' ? 'Registrar entrada' : tipo === 'saida' ? 'Registrar saída' : 'Ajustar'}
        </Botao>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex items-baseline justify-between gap-4 rounded-controle bg-acento-suave px-4 py-3">
          <span className="text-rotulo text-claro-secundario">{produto.nome}</span>
          <span className="text-corpo font-semibold text-claro">
            {formatarQuantidade(produto.estoque_atual)} {produto.unidade}
          </span>
        </div>

        <Contador
          rotulo={tipo === 'ajuste' ? 'Quantas unidades tem de verdade?' : 'Quantidade'}
          valor={valor}
          aoMudar={setValor}
          unidade={produto.unidade}
          dica={
            tipo === 'ajuste'
              ? 'Conte e digite o número real. O sistema calcula a diferença.'
              : undefined
          }
        />

        {Number.isFinite(digitado) && (
          <div className="flex items-baseline justify-between gap-4 px-1">
            <span className="text-rotulo text-claro-secundario">Fica com</span>
            <span className="text-corpo font-semibold text-claro">
              {formatarQuantidade(saldoPrevisto)} {produto.unidade}
              {tipo === 'ajuste' && diferenca !== 0 && (
                <span className="pl-2 text-apoio font-normal text-claro-secundario">
                  ({diferenca > 0 ? '+' : ''}
                  {formatarQuantidade(diferenca)})
                </span>
              )}
            </span>
          </div>
        )}

        <Campo
          rotulo="Motivo"
          obrigatorio
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Por que este lançamento?"
          autoCapitalize="sentences"
        />

        <div className="flex flex-wrap gap-2">
          {sugestoes[tipo].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setMotivo(s)}
              className="min-h-toque rounded-badge border border-borda-clara px-3 text-apoio text-claro-secundario active:bg-borda-clara/50"
            >
              {s}
            </button>
          ))}
        </div>

        {erroGeral && (
          <p role="alert" className="rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro">
            {erroGeral}
          </p>
        )}
      </div>
    </Modal>
  )
}
