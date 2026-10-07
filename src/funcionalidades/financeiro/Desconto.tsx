/**
 * Desconto na hora de receber (0083).
 *
 * O caso que trouxe isto: o cliente pagou à vista no PIX e a oficina deu um
 * desconto. Antes, registrar R$ 450 numa conta de R$ 500 deixava R$ 50 em
 * aberto — e o cliente aparecia como devendo.
 *
 * Só o dono dá desconto (o financeiro já é só dele; o banco confere de novo).
 * O valor da conta passa a ser o valor com desconto, a comissão do indicador
 * cai junto (se ainda não foi paga), e o desconto vai para o PDF da OS.
 */
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Abas } from '@/componentes/ui/Abas'
import { Botao } from '@/componentes/ui/Botao'
import { Campo } from '@/componentes/ui/Campo'
import { Modal } from '@/componentes/ui/Modal'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { moeda } from '@/lib/formato'
import { paraNumero } from '@/lib/numero'
import { darDesconto, desfazerDesconto, type ComissaoNoDesconto, type ContaAReceber } from './api'

export type TipoDeDesconto = 'valor' | 'percentual'

const TIPOS = [
  { id: 'valor', rotulo: 'Em reais' },
  { id: 'percentual', rotulo: 'Em porcento' },
] as const

/** Quanto sai, em reais, do que falta receber. Porcentagem é do que falta. */
export function valorDoDesconto(tipo: TipoDeDesconto, texto: string, falta: number): number {
  const n = paraNumero(texto) || 0
  if (n <= 0) return 0
  const reais = tipo === 'percentual' ? (falta * Math.min(n, 100)) / 100 : n
  return Math.round(reais * 100) / 100
}

/** O que dizer sobre a comissão do indicador, quando há algo a dizer. */
export function avisoDaComissao(comissao: ComissaoNoDesconto): string | null {
  if (comissao === 'ajustada') return 'A comissão do indicador foi ajustada junto.'
  if (comissao === 'ja_paga') {
    return 'A comissão desta OS já tinha sido paga ao indicador e não mudou.'
  }
  return null
}

export function useDescontoNoFormulario() {
  const [tipo, setTipo] = useState<TipoDeDesconto>('valor')
  const [texto, setTexto] = useState('')
  const [motivo, setMotivo] = useState('')
  return {
    tipo, setTipo, texto, setTexto, motivo, setMotivo,
    limpar() {
      setTipo('valor')
      setTexto('')
      setMotivo('')
    },
  }
}

export type DescontoNoFormulario = ReturnType<typeof useDescontoNoFormulario>

/** Tipo, valor e motivo, com a conta feita na hora. */
export function CamposDeDesconto({ d, falta }: { d: DescontoNoFormulario; falta: number }) {
  const desconto = valorDoDesconto(d.tipo, d.texto, falta)
  const passou = desconto > falta
  return (
    <div className="flex flex-col gap-3">
      <Abas rotulo="Tipo de desconto" abas={TIPOS} ativa={d.tipo} aoTrocar={d.setTipo} />
      <Campo
        rotulo={d.tipo === 'valor' ? 'Valor do desconto' : 'Percentual de desconto'}
        inputMode="decimal"
        placeholder={d.tipo === 'valor' ? '20,00' : '5'}
        value={d.texto}
        onChange={(e) => d.setTexto(e.target.value)}
        erro={passou ? `O desconto passa do que falta receber (${moeda(falta)}).` : undefined}
      />
      {desconto > 0 && !passou && (
        <p className="text-apoio text-em-superficie-2">
          Desconto de <strong className="text-em-superficie">{moeda(desconto)}</strong>. O cliente
          paga <strong className="text-em-superficie">{moeda(falta - desconto)}</strong>.
        </p>
      )}
      <Campo
        rotulo="Motivo do desconto"
        obrigatorio
        placeholder="Pagou à vista no PIX"
        dica="Aparece para o cliente no PDF da ordem de serviço."
        value={d.motivo}
        onChange={(e) => d.setMotivo(e.target.value)}
      />
    </div>
  )
}

/** Dar desconto sem receber ainda — para cobrar o PIX já com o valor certo. */
export function JanelaDeDesconto({ conta, aoFechar }: { conta: ContaAReceber | null; aoFechar: () => void }) {
  const toast = useToast()
  const cache = useQueryClient()
  const d = useDescontoNoFormulario()
  const falta = conta ? Number(conta.valor) - Number(conta.valor_recebido) : 0
  const desconto = valorDoDesconto(d.tipo, d.texto, falta)

  const aplicar = useMutation({
    mutationFn: () => darDesconto(conta!.id, desconto, d.motivo.trim()),
    onSuccess: (comissao) => {
      void cache.invalidateQueries({ queryKey: ['contas-receber'] })
      void cache.invalidateQueries({ queryKey: ['correcoes'] })
      toast.sucesso(`Desconto de ${moeda(desconto)} aplicado. Agora é só cobrar ou dar baixa.`)
      const aviso = avisoDaComissao(comissao)
      if (aviso) toast.aviso(aviso)
      d.limpar()
      aoFechar()
    },
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  return (
    <Modal
      aberto={conta !== null}
      aoFechar={() => {
        d.limpar()
        aoFechar()
      }}
      titulo="Dar desconto"
      rodape={
        <Botao
          largo
          carregando={aplicar.isPending}
          disabled={desconto <= 0 || desconto > falta || d.motivo.trim().length < 3}
          onClick={() => aplicar.mutate()}
        >
          Aplicar desconto
        </Botao>
      }
    >
      <p className="pb-4 text-corpo text-em-superficie-2">
        {conta?.descricao} — falta receber {moeda(falta)}
      </p>
      <CamposDeDesconto d={d} falta={falta} />
    </Modal>
  )
}

/** Desfazer: a conta volta ao valor original, e a comissão volta junto. */
export function JanelaDeDesfazerDesconto({
  conta,
  aoFechar,
}: {
  conta: ContaAReceber | null
  aoFechar: () => void
}) {
  const toast = useToast()
  const cache = useQueryClient()
  const [motivo, setMotivo] = useState('')

  const desfazer = useMutation({
    mutationFn: () => desfazerDesconto(conta!.id, motivo.trim()),
    onSuccess: (comissao) => {
      void cache.invalidateQueries({ queryKey: ['contas-receber'] })
      void cache.invalidateQueries({ queryKey: ['correcoes'] })
      toast.sucesso('Desconto desfeito. A conta voltou ao valor original.')
      const aviso = avisoDaComissao(comissao)
      if (aviso) toast.aviso(aviso)
      setMotivo('')
      aoFechar()
    },
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  return (
    <Modal
      aberto={conta !== null}
      aoFechar={() => {
        setMotivo('')
        aoFechar()
      }}
      titulo="Desfazer desconto"
      rodape={
        <Botao
          largo
          carregando={desfazer.isPending}
          disabled={motivo.trim().length < 3}
          onClick={() => desfazer.mutate()}
        >
          Desfazer desconto
        </Botao>
      }
    >
      <p className="pb-4 text-corpo text-em-superficie-2">
        {conta?.descricao}: volta de {moeda(Number(conta?.valor ?? 0))} para{' '}
        {moeda(Number(conta?.valor ?? 0) + Number(conta?.desconto ?? 0))}. Se o que já entrou não
        cobrir esse valor, a conta reabre com o saldo.
      </p>
      <Campo
        rotulo="Motivo"
        obrigatorio
        placeholder="Dei o desconto por engano"
        dica="Fica registrado com o seu nome no histórico da conta."
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
      />
    </Modal>
  )
}
