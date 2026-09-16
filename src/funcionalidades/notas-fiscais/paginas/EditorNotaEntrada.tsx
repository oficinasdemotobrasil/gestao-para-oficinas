import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Tela, CabecalhoInterno, TituloSecao } from '@/componentes/layout/Tela'
import { Campo, Selecao, Interruptor } from '@/componentes/ui/Campo'
import { Botao } from '@/componentes/ui/Botao'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { moeda } from '@/lib/formato'
import { paraNumero } from '@/lib/numero'
import { useAuth } from '@/auth/ProvedorAuth'
import type { FormaPagamento } from '@/tipos/banco'
import { FORMAS } from '@/funcionalidades/financeiro/api'
import { ItensDaNotaEntrada } from '../ItensDaNotaEntrada'
import { CamposFiscais, fiscalVazio, type DadosFiscais } from '../CamposFiscais'
import { salvarNotaEntrada, type ItemEntradaEmEdicao } from '../api'

const hoje = () => new Date().toISOString().slice(0, 10)

export function EditorNotaEntrada() {
  const navegar = useNavigate()
  const toast = useToast()
  const cache = useQueryClient()
  const { oficina } = useAuth()

  const [numero, setNumero] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [dataEmissao, setDataEmissao] = useState(hoje())
  const [itens, setItens] = useState<ItemEntradaEmEdicao[]>([])
  const [fiscal, setFiscal] = useState<DadosFiscais>(fiscalVazio)
  const [categoria, setCategoria] = useState('Fornecedor')
  const [forma, setForma] = useState<FormaPagamento | ''>('')
  const [pagoAgora, setPagoAgora] = useState(false)
  const [parcelas, setParcelas] = useState('1')
  const [vencimento, setVencimento] = useState(hoje())
  const [erroGeral, setErroGeral] = useState<string | null>(null)

  const total = itens.reduce((acc, i) => acc + i.quantidade * (i.custo_unitario ?? 0), 0)

  const salvar = useMutation({
    mutationFn: () =>
      salvarNotaEntrada({
        numero: numero.trim(),
        fornecedor: fornecedor.trim() || null,
        data_emissao: dataEmissao,
        valor_total: total,
        arquivo_url: null,
        itens,
        natureza_operacao: fiscal.natureza_operacao || null,
        cfop: fiscal.cfop || null,
        base_calculo_icms: fiscal.base_calculo_icms ? paraNumero(fiscal.base_calculo_icms) : null,
        valor_icms: fiscal.valor_icms ? paraNumero(fiscal.valor_icms) : null,
        valor_iss: fiscal.valor_iss ? paraNumero(fiscal.valor_iss) : null,
        parcelas: pagoAgora ? 1 : Number(parcelas) || 1,
        primeiro_vencimento: pagoAgora ? dataEmissao : vencimento,
        categoria: categoria || null,
        forma_pagamento: forma || null,
        pago_agora: pagoAgora,
      }),
    onSuccess: (novoId) => {
      void cache.invalidateQueries({ queryKey: ['notas-entrada'] })
      void cache.invalidateQueries({ queryKey: ['produtos'] })
      void cache.invalidateQueries({ queryKey: ['contas-pagar'] })
      toast.sucesso('Nota lançada. O estoque e o Financeiro já foram atualizados.')
      navegar(`/notas-fiscais/entrada/${novoId}`, { replace: true })
    },
    onError: (e) => setErroGeral(traduzirErro(e)),
  })

  function enviar() {
    setErroGeral(null)
    if (!numero.trim()) return setErroGeral('Informe o número da nota.')
    if (itens.length === 0) return setErroGeral('Adicione pelo menos uma peça.')
    salvar.mutate()
  }

  return (
    <Tela comRodapeFixo>
      <CabecalhoInterno titulo="Nova nota de entrada" contexto="Compra de fornecedor" />

      <div className="flex flex-col gap-4 rounded-card bg-superficie p-5 shadow-card">
        <div className="grid grid-cols-2 gap-3">
          <Campo
            rotulo="Número da nota"
            obrigatorio
            placeholder="9001"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
          />
          <Campo
            rotulo="Data de emissão"
            type="date"
            value={dataEmissao}
            onChange={(e) => setDataEmissao(e.target.value)}
          />
        </div>
        <Campo
          rotulo="Fornecedor"
          placeholder="Distribuidora de Peças Rio"
          value={fornecedor}
          onChange={(e) => setFornecedor(e.target.value)}
        />
      </div>

      <TituloSecao>Peças</TituloSecao>
      <ItensDaNotaEntrada itens={itens} aoMudar={setItens} />

      <TituloSecao>Financeiro</TituloSecao>
      <div className="flex flex-col gap-4 rounded-card bg-superficie p-5 shadow-card">
        <Interruptor
          rotulo="Já paguei"
          descricao="A conta nasce quitada, sem entrar na fila de vencimento."
          marcado={pagoAgora}
          aoMudar={setPagoAgora}
        />

        {!pagoAgora && (
          <div className="grid grid-cols-2 gap-3">
            <Campo
              rotulo="Em quantas vezes"
              inputMode="numeric"
              value={parcelas}
              onChange={(e) => setParcelas(e.target.value.replace(/\D/g, ''))}
            />
            <Campo
              rotulo="Primeiro vencimento"
              type="date"
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Selecao rotulo="Categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {(oficina?.categorias_despesa ?? ['Fornecedor']).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Selecao>
          <Selecao
            rotulo="Forma de pagamento"
            value={forma}
            onChange={(e) => setForma(e.target.value as FormaPagamento | '')}
          >
            <option value="">Não informar</option>
            {FORMAS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.rotulo}
              </option>
            ))}
          </Selecao>
        </div>
      </div>

      <TituloSecao>Dados fiscais</TituloSecao>
      <CamposFiscais dados={fiscal} aoMudar={setFiscal} comIss={false} />

      {erroGeral && (
        <p role="alert" className="mt-4 rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro-forte">
          {erroGeral}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-[calc(var(--altura-tabbar)+env(safe-area-inset-bottom))] z-30 border-t border-borda-em-fundo bg-fundo px-5 py-3">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-rotulo text-em-fundo-2">
              {itens.length} {itens.length === 1 ? 'peça' : 'peças'}
            </span>
            <span className="text-titulo text-acento-forte">{moeda(total)}</span>
          </div>
          <Botao largo carregando={salvar.isPending} onClick={enviar}>
            Lançar nota
          </Botao>
        </div>
      </div>
    </Tela>
  )
}
