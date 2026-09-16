import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { User } from 'lucide-react'
import { Tela, CabecalhoInterno, TituloSecao } from '@/componentes/layout/Tela'
import { Campo, Selecao } from '@/componentes/ui/Campo'
import { Botao } from '@/componentes/ui/Botao'
import { LinhaLista } from '@/componentes/ui/Card'
import { FolhaDeBusca, type OpcaoDeBusca } from '@/componentes/ui/FolhaDeBusca'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { moeda, telefone } from '@/lib/formato'
import { paraNumero } from '@/lib/numero'
import type { FormaPagamento } from '@/tipos/banco'
import { listarClientes } from '@/funcionalidades/clientes/api'
import { FORMAS } from '@/funcionalidades/financeiro/api'
import { ItensDaNotaSaida } from '../ItensDaNotaSaida'
import { CamposFiscais, fiscalVazio, type DadosFiscais } from '../CamposFiscais'
import { salvarNotaSaida, type ItemSaidaEmEdicao } from '../api'

const hoje = () => new Date().toISOString().slice(0, 10)

/**
 * Venda de balcão — sem ordem de serviço, o caso comum de "vendeu a peça e
 * já saiu andando". Formalizar a nota de uma OS já finalizada é uma tela
 * diferente: o estoque já baixou lá, esta aqui existe para não baixar de
 * novo — e ainda não tem botão de entrada (fica para quando a tela da OS
 * ganhar o atalho de "Emitir nota fiscal").
 */
export function EditorNotaSaida() {
  const navegar = useNavigate()
  const toast = useToast()
  const cache = useQueryClient()

  const [numero, setNumero] = useState('')
  const [cliente, setCliente] = useState<{ id: string; nome: string; telefone: string | null } | null>(null)
  const [escolhendoCliente, setEscolhendoCliente] = useState(false)
  const [itens, setItens] = useState<ItemSaidaEmEdicao[]>([])
  const [fiscal, setFiscal] = useState<DadosFiscais>(fiscalVazio)
  const [forma, setForma] = useState<FormaPagamento | ''>('')
  const [parcelas, setParcelas] = useState('1')
  const [vencimento, setVencimento] = useState(hoje())
  const [erroGeral, setErroGeral] = useState<string | null>(null)

  // FolhaDeBusca só devolve o id escolhido, não o registro inteiro — por isso
  // o nome e o telefone viajam compostos dentro do próprio id, como o
  // orçamento já faz para produto e serviço.
  const buscarClientes = useCallback(async (termo: string): Promise<OpcaoDeBusca[]> => {
    const lista = await listarClientes(termo)
    return lista.map((c) => ({
      id: `${c.id}|${c.nome}|${c.telefone ?? ''}`,
      titulo: c.nome,
      descricao: c.telefone ? telefone(c.telefone) : undefined,
    }))
  }, [])

  const total = itens.reduce((acc, i) => acc + i.quantidade * i.valor_unitario, 0)

  const salvar = useMutation({
    mutationFn: () =>
      salvarNotaSaida({
        numero: numero.trim() || null,
        cliente_id: cliente?.id ?? null,
        ordem_servico_id: null,
        itens,
        natureza_operacao: fiscal.natureza_operacao || null,
        cfop: fiscal.cfop || null,
        base_calculo_icms: fiscal.base_calculo_icms ? paraNumero(fiscal.base_calculo_icms) : null,
        valor_icms: fiscal.valor_icms ? paraNumero(fiscal.valor_icms) : null,
        base_calculo_iss: fiscal.base_calculo_iss ? paraNumero(fiscal.base_calculo_iss) : null,
        valor_iss: fiscal.valor_iss ? paraNumero(fiscal.valor_iss) : null,
        parcelas: Number(parcelas) || 1,
        primeiro_vencimento: vencimento,
        forma_pagamento: forma || null,
      }),
    onSuccess: (novoId) => {
      void cache.invalidateQueries({ queryKey: ['notas-saida'] })
      void cache.invalidateQueries({ queryKey: ['produtos'] })
      void cache.invalidateQueries({ queryKey: ['contas-receber'] })
      toast.sucesso('Venda registrada. O estoque e o Financeiro já foram atualizados.')
      navegar(`/notas-fiscais/saida/${novoId}`, { replace: true })
    },
    onError: (e) => setErroGeral(traduzirErro(e)),
  })

  function enviar() {
    setErroGeral(null)
    if (itens.length === 0) return setErroGeral('Adicione pelo menos um item.')
    if (!cliente && Number(parcelas) > 1) {
      return setErroGeral('Venda parcelada precisa de um cliente identificado, para cobrar depois.')
    }
    salvar.mutate()
  }

  return (
    <Tela comRodapeFixo>
      <CabecalhoInterno titulo="Nova venda" contexto="Venda de balcão" />

      <div className="flex flex-col gap-4 rounded-card bg-superficie p-5 shadow-card">
        <Campo
          rotulo="Número da nota"
          dica="Opcional. Deixe em branco se ainda não emite nota fiscal de verdade."
          placeholder="5001"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
        />

        {cliente ? (
          <LinhaLista
            inicio={
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-acento-suave">
                <User aria-hidden size={18} className="text-em-superficie" />
              </span>
            }
            titulo={cliente.nome}
            descricao={cliente.telefone ? telefone(cliente.telefone) : 'Sem telefone'}
            fim={
              <button
                type="button"
                onClick={() => setCliente(null)}
                className="text-apoio font-medium text-erro-forte"
              >
                Remover
              </button>
            }
            comSeta={false}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEscolhendoCliente(true)}
            className="flex min-h-toque items-center justify-center gap-2 rounded-card border border-borda-em-fundo text-em-fundo active:bg-fundo-2"
          >
            <User aria-hidden size={18} />
            <span className="text-rotulo font-medium">Identificar cliente</span>
          </button>
        )}
        <p className="text-apoio text-em-superficie-2">
          Sem cliente, a venda entra no estoque mas não gera cobrança — é o caso de quem já
          pagou na hora, em dinheiro.
        </p>
      </div>

      <TituloSecao>Itens</TituloSecao>
      <ItensDaNotaSaida itens={itens} aoMudar={setItens} />

      {cliente && (
        <>
          <TituloSecao>Financeiro</TituloSecao>
          <div className="flex flex-col gap-4 rounded-card bg-superficie p-5 shadow-card">
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
        </>
      )}

      <TituloSecao>Dados fiscais</TituloSecao>
      <CamposFiscais dados={fiscal} aoMudar={setFiscal} />

      {erroGeral && (
        <p role="alert" className="mt-4 rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro-forte">
          {erroGeral}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-[calc(var(--altura-tabbar)+env(safe-area-inset-bottom))] z-30 border-t border-borda-em-fundo bg-fundo px-5 py-3">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-rotulo text-em-fundo-2">
              {itens.length} {itens.length === 1 ? 'item' : 'itens'}
            </span>
            <span className="text-titulo text-acento-forte">{moeda(total)}</span>
          </div>
          <Botao largo carregando={salvar.isPending} onClick={enviar}>
            Registrar venda
          </Botao>
        </div>
      </div>

      <FolhaDeBusca
        aberto={escolhendoCliente}
        aoFechar={() => setEscolhendoCliente(false)}
        titulo="Escolher cliente"
        placeholder="Nome ou telefone"
        buscar={buscarClientes}
        aoEscolher={(chaveComposta) => {
          const [id, nome, tel] = chaveComposta.split('|')
          setCliente({ id, nome, telefone: tel || null })
          setEscolhendoCliente(false)
        }}
        vazio={{ titulo: 'Nenhum cliente encontrado', descricao: 'Cadastre o cliente antes, ou venda sem identificar.' }}
      />
    </Tela>
  )
}
