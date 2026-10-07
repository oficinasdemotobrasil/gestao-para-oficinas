import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, QrCode, CheckCircle2, Wallet, Lock, PencilLine, BadgePercent } from 'lucide-react'
import { Tela, CabecalhoTela, TituloSecao } from '@/componentes/layout/Tela'
import { Abas } from '@/componentes/ui/Abas'
import { Card } from '@/componentes/ui/Card'
import { ListaResponsiva } from '@/componentes/ui/ListaResponsiva'
import { Badge } from '@/componentes/ui/Badge'
import { Botao } from '@/componentes/ui/Botao'
import { Campo, Selecao } from '@/componentes/ui/Campo'
import { Modal } from '@/componentes/ui/Modal'
import { supabase } from '@/lib/supabase'
import { EstadoVazio, EstadoErro } from '@/componentes/ui/EstadoVazio'
import { EsqueletoLista } from '@/componentes/ui/Carregando'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { paraNumero } from '@/lib/numero'
import { moeda, data as formatarData, hojeNoAparelho } from '@/lib/formato'
import { useAuth } from '@/auth/ProvedorAuth'
import { usePermissoes } from '@/auth/usePermissoes'
import { CobrancaPix } from '../CobrancaPix'
import {
  CamposDeDesconto,
  JanelaDeDesconto,
  JanelaDeDesfazerDesconto,
  avisoDaComissao,
  useDescontoNoFormulario,
  valorDoDesconto,
} from '../Desconto'
import {
  listarContasAReceber,
  listarContasAPagar,
  receberConta,
  darDesconto,
  pagarConta,
  corrigirRecebimento,
  corrigirPagamento,
  correcoesDaConta,
  lancarContaAPagar,
  statusDaConta,
  rotuloDaForma,
  resumo,
  FORMAS,
  type ContaAReceber,
  type FiltroDeContas,
} from '../api'
import type { ContaPagar, FormaPagamento, StatusConta } from '@/tipos/banco'

/**
 * Troca o código da forma pelo rótulo, na frase que o banco montou.
 *
 * O banco guarda a frase pronta e com o código cru — 'pix', 'credito' —, porque
 * é ele quem sabe o valor no instante da correção. O nome bonito é assunto de
 * tela, e a frase sempre começa pela forma, então a troca é só no primeiro
 * pedaço.
 */
function comRotulo(texto: string): string {
  const [forma, ...resto] = texto.split(', ')
  const achada = FORMAS.find((f) => f.id === forma)
  return [achada?.rotulo ?? forma, ...resto].join(', ')
}

const abas = [
  { id: 'receber', rotulo: 'A receber' },
  { id: 'pagar', rotulo: 'A pagar' },
] as const

const situacoes = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'aberta', rotulo: 'Em aberto' },
  { id: 'atrasada', rotulo: 'Atrasadas' },
  { id: 'paga', rotulo: 'Pagas' },
] as const

const tomDoStatus: Record<StatusConta, 'sucesso' | 'atencao' | 'erro' | 'neutro'> = {
  aberta: 'atencao',
  paga: 'sucesso',
  atrasada: 'erro',
  cancelada: 'neutro',
}
const rotuloDoStatus: Record<StatusConta, string> = {
  aberta: 'Em aberto',
  paga: 'Paga',
  atrasada: 'Atrasada',
  cancelada: 'Cancelada',
}

/** O primeiro e o último dia do mês corrente, em aaaa-mm-dd. */
function mesCorrente(): { de: string; ate: string } {
  const hoje = new Date()
  const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const ultimo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { de: iso(primeiro), ate: iso(ultimo) }
}

function LinhaResumo({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 desktop:flex-col desktop:items-start desktop:gap-1">
      <span className="text-rotulo text-em-superficie-2">{rotulo}</span>
      <span className={`text-corpo font-medium desktop:text-secao ${tom ?? 'text-em-superficie'}`}>
        {valor}
      </span>
    </div>
  )
}

export function Financeiro() {
  const navegar = useNavigate()

  // Qual plano abre o financeiro, segundo o banco. Assim o texto acompanha
  // qualquer renomeação sem ninguém precisar lembrar deste arquivo.
  const planoComFinanceiro = useQuery({
    queryKey: ['plano-com-financeiro'],
    queryFn: async () => {
      const { data, error } = await supabase
        // `dias_de_teste is null` tira o plano de teste da lista: ele tem
        // financeiro, mas dizer "assine o Teste 7 Dias" para quem já testou
        // seria mandar a pessoa de volta para onde ela estava.
        .from('planos').select('nome').eq('tem_financeiro', true).eq('ativo', true)
        .is('dias_de_teste', null)
        .order('ordem').limit(1).maybeSingle()
      if (error) throw error
      return data
    },
  })

  const toast = useToast()
  const cache = useQueryClient()
  const { oficina } = useAuth()
  const p = usePermissoes()

  const [aba, setAba] = useState<'receber' | 'pagar'>('receber')
  const [status, setStatus] = useState<StatusConta | 'todas'>('todas')
  const [periodo, setPeriodo] = useState(mesCorrente)

  const [cobrando, setCobrando] = useState<ContaAReceber | null>(null)
  const [baixando, setBaixando] = useState<{ conta: ContaAReceber | ContaPagar; tipo: 'receber' | 'pagar' } | null>(null)
  const [valorDaBaixa, setValorDaBaixa] = useState('')
  const [formaDaBaixa, setFormaDaBaixa] = useState<FormaPagamento | ''>('')
  const [lancando, setLancando] = useState(false)

  // Desconto na hora de receber (0083): junto com a baixa, sozinho (para
  // cobrar o PIX já com o valor certo) e o desfazer.
  const [comDesconto, setComDesconto] = useState(false)
  const descontoDaBaixa = useDescontoNoFormulario()
  const [descontando, setDescontando] = useState<ContaAReceber | null>(null)
  const [desfazendo, setDesfazendo] = useState<ContaAReceber | null>(null)

  function abrirBaixaDeRecebimento(c: ContaAReceber) {
    setBaixando({ conta: c, tipo: 'receber' })
    setValorDaBaixa('')
    setFormaDaBaixa(c.forma_pagamento ?? '')
    setComDesconto(false)
    descontoDaBaixa.limpar()
  }

  /*
   * A correção de uma baixa já feita.
   *
   * Separada do `baixando` porque são gestos diferentes: dar baixa soma ao que
   * entrou, corrigir substitui o que foi registrado. Misturar os dois numa
   * modal só faria a pessoa somar quando quisesse consertar.
   */
  const [corrigindo, setCorrigindo] = useState<{
    conta: ContaAReceber | ContaPagar
    tipo: 'receber' | 'pagar'
  } | null>(null)
  const [valorCorrigido, setValorCorrigido] = useState('')
  const [formaCorrigida, setFormaCorrigida] = useState<FormaPagamento | ''>('')
  const [dataCorrigida, setDataCorrigida] = useState('')
  const [motivoCorrecao, setMotivoCorrecao] = useState('')

  function abrirCorrecao(conta: ContaAReceber | ContaPagar, tipo: 'receber' | 'pagar') {
    setCorrigindo({ conta, tipo })
    setFormaCorrigida(conta.forma_pagamento ?? '')
    setDataCorrigida(conta.data_pagamento ?? '')
    setValorCorrigido(
      tipo === 'receber' ? String((conta as ContaAReceber).valor_recebido).replace('.', ',') : '',
    )
    setMotivoCorrecao('')
  }

  const filtro: FiltroDeContas = { status, de: periodo.de, ate: periodo.ate }

  const receber = useQuery({
    queryKey: ['contas-receber', filtro],
    queryFn: () => listarContasAReceber(filtro),
  })
  const pagar = useQuery({
    queryKey: ['contas-pagar', filtro],
    queryFn: () => listarContasAPagar(filtro),
  })

  function recarregar() {
    void cache.invalidateQueries({ queryKey: ['contas-receber'] })
    void cache.invalidateQueries({ queryKey: ['contas-pagar'] })
  }

  const baixar = useMutation({
    mutationFn: async () => {
      if (!baixando) return null
      const hoje = hojeNoAparelho()
      const forma = formaDaBaixa || null
      if (baixando.tipo === 'receber') {
        const parcial = paraNumero(valorDaBaixa)
        const conta = baixando.conta as ContaAReceber
        const falta = Number(conta.valor) - Number(conta.valor_recebido)
        const desconto = comDesconto
          ? valorDoDesconto(descontoDaBaixa.tipo, descontoDaBaixa.texto, falta)
          : 0
        if (desconto > 0) {
          // Desconto e baixa numa operação só: ou ficam os dois, ou nenhum.
          return darDesconto(conta.id, desconto, descontoDaBaixa.motivo.trim(), {
            valor: parcial > 0 ? parcial : null,
            data: hoje,
            forma,
          })
        }
        await receberConta(baixando.conta.id, parcial > 0 ? parcial : null, hoje, forma)
      } else {
        await pagarConta(baixando.conta.id, hoje, forma)
      }
      return null
    },
    onSuccess: (comissao) => {
      setBaixando(null)
      setValorDaBaixa('')
      setFormaDaBaixa('')
      setComDesconto(false)
      descontoDaBaixa.limpar()
      recarregar()
      void cache.invalidateQueries({ queryKey: ['correcoes'] })
      toast.sucesso('Baixa registrada.')
      const aviso = avisoDaComissao(comissao)
      if (aviso) toast.aviso(aviso)
    },
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  const historico = useQuery({
    queryKey: ['correcoes', corrigindo?.conta.id],
    enabled: corrigindo !== null,
    queryFn: () => correcoesDaConta(corrigindo!.conta.id, corrigindo!.tipo),
  })

  const corrigir = useMutation({
    mutationFn: async () => {
      if (!corrigindo) return
      const forma = formaCorrigida || null
      const data = dataCorrigida || null
      if (corrigindo.tipo === 'receber') {
        const valor = paraNumero(valorCorrigido)
        await corrigirRecebimento(corrigindo.conta.id, valor > 0 ? valor : null, data, forma, motivoCorrecao)
      } else {
        await corrigirPagamento(corrigindo.conta.id, data, forma, motivoCorrecao)
      }
    },
    onSuccess: () => {
      setCorrigindo(null)
      recarregar()
      // O histórico também: sem isto, quem corrige e reabre dentro de meio
      // minuto vê a lista vazia — pelo cache — e conclui que o registro não
      // ficou guardado. Justo na tela que existe para provar o contrário.
      void cache.invalidateQueries({ queryKey: ['correcoes'] })
      toast.sucesso('Correção registrada.')
    },
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  const numeros = resumo(receber.data ?? [], pagar.data ?? [])

  // Quem chega aqui já é admin — o que falta é o plano. Dizer isso é diferente
  // de mostrar duas listas vazias e deixar a pessoa achando que perdeu os
  // lançamentos.
  if (!p.financeiroNoPlano) {
    return (
      <Tela>
        <CabecalhoTela titulo="Financeiro" contexto="Contas a receber e a pagar" />
        <Card>
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-acento-suave">
              <Lock aria-hidden size={20} className="text-em-superficie" />
            </span>
            <div>
              <p className="text-secao text-em-superficie">O seu plano ainda não inclui o financeiro</p>
              {/* O nome do plano vem da tabela, e não escrito aqui: ele já mudou
                  uma vez (de "completo" para "Gestão Total") e este texto ficou
                  para trás apontando para um plano que não existe mais. */}
              <p className="pt-1 text-corpo text-em-superficie-2">
                Contas a receber, contas a pagar e cobrança por PIX entram no
                plano {planoComFinanceiro.data?.nome ?? 'mais completo'}. O que
                já estiver lançado continua aqui, esperando.
              </p>
              <div className="pt-4">
                <Botao type="button" onClick={() => navegar('/configuracoes')}>
                  Ver os planos
                </Botao>
              </div>
            </div>
          </div>
        </Card>
      </Tela>
    )
  }
  const lista = aba === 'receber' ? receber : pagar
  const carregando = lista.isPending

  return (
    <Tela>
      <CabecalhoTela titulo="Financeiro" contexto="O que entra e o que sai" />

      {/* No celular o resumo é uma lista de linhas dentro de um card — cabe
          na largura e se lê de cima para baixo. No computador ele espalha:
          quatro números que se comparam entre si não deveriam ficar em fila
          indiana num monitor largo. */}
      <Card className="desktop:grid desktop:grid-cols-4 desktop:gap-6">
        <LinhaResumo rotulo="A receber no período" valor={moeda(numeros.aReceber)} />
        {numeros.atrasado > 0 && (
          <LinhaResumo rotulo="Em atraso" valor={moeda(numeros.atrasado)} tom="text-erro-forte" />
        )}
        <LinhaResumo rotulo="Já recebido" valor={moeda(numeros.recebido)} tom="text-sucesso-forte" />
        <LinhaResumo rotulo="A pagar no período" valor={moeda(numeros.aPagar)} />
        <div className="flex items-baseline justify-between gap-4 border-t border-borda-em-superficie pt-3 desktop:col-span-4">
          <span className="text-secao text-em-superficie">Saldo previsto</span>
          <span
            className={`text-destaque ${numeros.saldo < 0 ? 'text-erro-forte' : 'text-em-superficie'}`}
          >
            {moeda(numeros.saldo)}
          </span>
        </div>
      </Card>

      {/* No computador as duas fileiras de abas e o período cabem na mesma
          linha. Empilhados, eles empurravam a tabela para baixo da dobra num
          monitor — e o período é justamente o que se troca o tempo todo. */}
      {/* flex-wrap, e não uma linha rígida: em 1024px as duas fileiras de abas
          mais o período passam da largura, e sem a quebra o período saía da
          tela. Em 1440px tudo cabe numa linha só. */}
      <div className="flex flex-col gap-3 pt-6 desktop:flex-row desktop:flex-wrap desktop:items-center">
        <Abas rotulo="Receber ou pagar" abas={abas} ativa={aba} aoTrocar={setAba} />
        <Abas rotulo="Situação da conta" abas={situacoes} ativa={status} aoTrocar={setStatus} />

        <div className="flex gap-3 desktop:ml-auto desktop:shrink-0">
          <div className="flex-1 desktop:w-40 desktop:flex-none">
            <Campo
              rotulo="De"
              sobreFundo
              type="date"
              value={periodo.de}
              onChange={(e) => setPeriodo((p) => ({ ...p, de: e.target.value }))}
            />
          </div>
          <div className="flex-1 desktop:w-40 desktop:flex-none">
            <Campo
              rotulo="Até"
              sobreFundo
              type="date"
              value={periodo.ate}
              onChange={(e) => setPeriodo((p) => ({ ...p, ate: e.target.value }))}
            />
          </div>
        </div>

        {aba === 'pagar' && (
          <Botao
            largo
            compactoNoDesktop
            icone={<Plus aria-hidden size={20} />}
            onClick={() => setLancando(true)}
          >
            Lançar despesa
          </Botao>
        )}
      </div>

      <TituloSecao>{aba === 'receber' ? 'Contas a receber' : 'Contas a pagar'}</TituloSecao>

      {carregando ? (
        <EsqueletoLista />
      ) : lista.isError ? (
        <EstadoErro aoTentarDeNovo={() => void lista.refetch()} />
      ) : (lista.data ?? []).length === 0 ? (
        <EstadoVazio
          icone={<Wallet aria-hidden size={28} />}
          titulo="Nada neste período"
          descricao={
            aba === 'receber'
              ? 'A cobrança nasce quando você finaliza uma ordem de serviço.'
              : 'Lance aqui aluguel, fornecedor, salário e o que mais sair do caixa.'
          }
        />
      ) : (
        aba === 'receber' ? (
          <ListaResponsiva
            descricao="Contas a receber"
            formatoNoCelular="cartoes"
            itens={receber.data ?? []}
            chaveDoItem={(c) => c.id}
            cartao={(c) => {
                const efetivo = statusDaConta(c)
                const falta = Number(c.valor) - Number(c.valor_recebido)
                return (
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-corpo font-medium text-em-superficie">{c.descricao}</p>
                        <p className="truncate text-apoio text-em-superficie-2">
                          {c.cliente?.nome ?? 'sem cliente'} · vence {formatarData(c.vencimento)}
                        </p>
                      </div>
                      <Badge tom={tomDoStatus[efetivo]}>{rotuloDoStatus[efetivo]}</Badge>
                    </div>

                    <div className="flex items-baseline justify-between gap-4 pt-3">
                      <span className="text-apoio text-em-superficie-2">
                        {Number(c.valor_recebido) > 0 && efetivo !== 'paga'
                          ? `${moeda(c.valor_recebido)} de ${moeda(c.valor)} · faltam ${moeda(falta)}`
                          : rotuloDaForma(c.forma_pagamento)}
                      </span>
                      <span className="text-corpo font-semibold text-em-superficie">{moeda(c.valor)}</span>
                    </div>

                    {Number(c.desconto) > 0 && (
                      <div className="flex items-baseline justify-between gap-3 pt-1">
                        <span className="text-apoio text-em-superficie-2">
                          Desconto de {moeda(c.desconto)}
                          {c.motivo_do_desconto ? ` · ${c.motivo_do_desconto}` : ''}
                        </span>
                        {efetivo !== 'cancelada' && (
                          <Botao variante="texto" onClick={() => setDesfazendo(c)}>
                            Desfazer
                          </Botao>
                        )}
                      </div>
                    )}

                    {efetivo === 'paga' && (
                      <div className="border-t border-borda-em-superficie pt-3 mt-3">
                        <Botao
                          largo
                          variante="contorno-no-card"
                          icone={<PencilLine aria-hidden size={20} />}
                          onClick={() => abrirCorrecao(c, 'receber')}
                        >
                          Corrigir recebimento
                        </Botao>
                      </div>
                    )}

                    {efetivo !== 'paga' && efetivo !== 'cancelada' && (
                      <div className="flex flex-col gap-2 border-t border-borda-em-superficie pt-3 mt-3">
                        <Botao
                          largo
                          variante="contorno-no-card"
                          icone={<QrCode aria-hidden size={20} />}
                          onClick={() => setCobrando(c)}
                        >
                          Cobrar por PIX
                        </Botao>
                        <Botao
                          largo
                          variante="contorno-no-card"
                          icone={<BadgePercent aria-hidden size={20} />}
                          onClick={() => setDescontando(c)}
                        >
                          Dar desconto
                        </Botao>
                        <Botao
                          largo
                          icone={<CheckCircle2 aria-hidden size={20} />}
                          onClick={() => abrirBaixaDeRecebimento(c)}
                        >
                          Marcar como recebida
                        </Botao>
                      </div>
                    )}
                  </Card>
                )
            }}
            colunas={[
              {
                chave: 'descricao',
                titulo: 'Cobrança',
                celula: (c) => <span className="font-medium">{c.descricao}</span>,
              },
              { chave: 'cliente', titulo: 'Cliente', celula: (c) => c.cliente?.nome ?? '—' },
              {
                chave: 'vencimento',
                titulo: 'Vence',
                largura: 'w-32',
                celula: (c) => formatarData(c.vencimento),
              },
              {
                chave: 'forma',
                titulo: 'Forma',
                peso: 'apoio',
                largura: 'w-36',
                celula: (c) => rotuloDaForma(c.forma_pagamento),
              },
              {
                chave: 'valor',
                titulo: 'Valor',
                alinhar: 'direita',
                largura: 'w-40',
                celula: (c) => (
                  <span className="font-semibold">
                    {moeda(c.valor)}
                    {Number(c.desconto) > 0 && (
                      <button
                        type="button"
                        onClick={() => statusDaConta(c) !== 'cancelada' && setDesfazendo(c)}
                        title={c.motivo_do_desconto ?? undefined}
                        className="block w-full text-right text-apoio font-normal text-em-superficie-2 underline decoration-dotted underline-offset-2"
                      >
                        com desconto de {moeda(c.desconto)}
                      </button>
                    )}
                    {Number(c.valor_recebido) > 0 && statusDaConta(c) !== 'paga' && (
                      <span className="block text-apoio font-normal text-em-superficie-2">
                        faltam {moeda(Number(c.valor) - Number(c.valor_recebido))}
                      </span>
                    )}
                  </span>
                ),
              },
              {
                chave: 'status',
                titulo: 'Situação',
                largura: 'w-32',
                celula: (c) => {
                  const e = statusDaConta(c)
                  return <Badge tom={tomDoStatus[e]}>{rotuloDoStatus[e]}</Badge>
                },
              },
              {
                chave: 'acoes',
                titulo: '',
                largura: 'w-64',
                celula: (c) => {
                  const e = statusDaConta(c)
                  if (e === 'paga') {
                    return (
                      <Botao
                        variante="contorno-no-card"
                        icone={<PencilLine aria-hidden size={18} />}
                        onClick={() => abrirCorrecao(c, 'receber')}
                      >
                        Corrigir
                      </Botao>
                    )
                  }
                  if (e === 'cancelada') return null
                  return (
                    <div className="flex gap-2">
                      <Botao
                        variante="contorno-no-card"
                        icone={<QrCode aria-hidden size={18} />}
                        onClick={() => setCobrando(c)}
                      >
                        PIX
                      </Botao>
                      <Botao
                        variante="contorno-no-card"
                        icone={<BadgePercent aria-hidden size={18} />}
                        aria-label="Dar desconto"
                        title="Dar desconto"
                        onClick={() => setDescontando(c)}
                      />
                      <Botao
                        icone={<CheckCircle2 aria-hidden size={18} />}
                        onClick={() => abrirBaixaDeRecebimento(c)}
                      >
                        Recebi
                      </Botao>
                    </div>
                  )
                },
              },
            ]}
          />
        ) : (
          <ListaResponsiva
            descricao="Contas a pagar"
            formatoNoCelular="cartoes"
            itens={pagar.data ?? []}
            chaveDoItem={(c) => c.id}
            cartao={(c) => {
                const efetivo = statusDaConta({ ...c, valor_recebido: 0 })
                return (
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-corpo font-medium text-em-superficie">{c.descricao}</p>
                        <p className="truncate text-apoio text-em-superficie-2">
                          {[c.fornecedor, c.categoria].filter(Boolean).join(' · ') || 'sem categoria'}
                          {` · vence ${formatarData(c.vencimento)}`}
                        </p>
                      </div>
                      <Badge tom={tomDoStatus[efetivo]}>{rotuloDoStatus[efetivo]}</Badge>
                    </div>

                    <div className="flex items-baseline justify-between gap-4 pt-3">
                      <span className="text-apoio text-em-superficie-2">
                        {rotuloDaForma(c.forma_pagamento)}
                      </span>
                      <span className="text-corpo font-semibold text-em-superficie">{moeda(c.valor)}</span>
                    </div>

                    {efetivo === 'paga' && (
                      <div className="border-t border-borda-em-superficie pt-3 mt-3">
                        <Botao
                          largo
                          variante="contorno-no-card"
                          icone={<PencilLine aria-hidden size={20} />}
                          onClick={() => abrirCorrecao(c, 'pagar')}
                        >
                          Corrigir pagamento
                        </Botao>
                      </div>
                    )}

                    {efetivo !== 'paga' && efetivo !== 'cancelada' && (
                      <div className="border-t border-borda-em-superficie pt-3 mt-3">
                        <Botao
                          largo
                          icone={<CheckCircle2 aria-hidden size={20} />}
                          onClick={() => {
                            setBaixando({ conta: c, tipo: 'pagar' })
                            setFormaDaBaixa(c.forma_pagamento ?? '')
                          }}
                        >
                          Marcar como paga
                        </Botao>
                      </div>
                    )}
                  </Card>
                )
            }}
            colunas={[
              {
                chave: 'descricao',
                titulo: 'Despesa',
                celula: (c) => <span className="font-medium">{c.descricao}</span>,
              },
              {
                chave: 'fornecedor',
                titulo: 'Fornecedor',
                celula: (c) => c.fornecedor ?? '—',
              },
              {
                chave: 'categoria',
                titulo: 'Categoria',
                peso: 'apoio',
                largura: 'w-40',
                celula: (c) => c.categoria ?? '—',
              },
              {
                chave: 'vencimento',
                titulo: 'Vence',
                largura: 'w-32',
                celula: (c) => formatarData(c.vencimento),
              },
              {
                chave: 'valor',
                titulo: 'Valor',
                alinhar: 'direita',
                largura: 'w-36',
                celula: (c) => <span className="font-semibold">{moeda(c.valor)}</span>,
              },
              {
                chave: 'status',
                titulo: 'Situação',
                largura: 'w-32',
                celula: (c) => {
                  const e = statusDaConta({ ...c, valor_recebido: 0 })
                  return <Badge tom={tomDoStatus[e]}>{rotuloDoStatus[e]}</Badge>
                },
              },
              {
                chave: 'acoes',
                titulo: '',
                largura: 'w-40',
                celula: (c) => {
                  const e = statusDaConta({ ...c, valor_recebido: 0 })
                  if (e === 'paga') {
                    return (
                      <Botao
                        variante="contorno-no-card"
                        icone={<PencilLine aria-hidden size={18} />}
                        onClick={() => abrirCorrecao(c, 'pagar')}
                      >
                        Corrigir
                      </Botao>
                    )
                  }
                  if (e === 'cancelada') return null
                  return (
                    <Botao
                      icone={<CheckCircle2 aria-hidden size={18} />}
                      onClick={() => {
                        setBaixando({ conta: c, tipo: 'pagar' })
                        setFormaDaBaixa(c.forma_pagamento ?? '')
                      }}
                    >
                      Paguei
                    </Botao>
                  )
                },
              },
            ]}
          />
        )
      )}

      {cobrando && (
        <CobrancaPix conta={cobrando} aberto aoFechar={() => setCobrando(null)} />
      )}

      <Modal
        aberto={baixando !== null}
        aoFechar={() => setBaixando(null)}
        titulo={baixando?.tipo === 'pagar' ? 'Marcar como paga' : 'Marcar como recebida'}
        rodape={
          <Botao largo carregando={baixar.isPending} onClick={() => baixar.mutate()}>
            Confirmar
          </Botao>
        }
      >
        <p className="pb-4 text-corpo text-em-superficie-2">
          {baixando?.conta.descricao} — {moeda(baixando?.conta.valor ?? 0)}
        </p>

        <div className="flex flex-col gap-4 pb-2">
          <Selecao
            rotulo="Forma de pagamento"
            value={formaDaBaixa}
            onChange={(e) => setFormaDaBaixa(e.target.value as FormaPagamento | '')}
          >
            <option value="">Não informar</option>
            {FORMAS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.rotulo}
              </option>
            ))}
          </Selecao>

          {baixando?.tipo === 'receber' && (
            <Campo
              rotulo="Valor recebido"
              inputMode="decimal"
              placeholder="Deixe vazio se recebeu tudo"
              dica={
                comDesconto
                  ? 'Vazio: recebeu tudo o que sobra depois do desconto.'
                  : 'Recebeu só uma parte? Digite quanto entrou — a conta continua aberta com o saldo.'
              }
              value={valorDaBaixa}
              onChange={(e) => setValorDaBaixa(e.target.value)}
            />
          )}

          {baixando?.tipo === 'receber' && (
            <div className="rounded-controle border border-borda-em-superficie p-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={comDesconto}
                  onChange={(e) => setComDesconto(e.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 accent-[rgb(var(--cor-acento))]"
                />
                <span className="text-corpo text-em-superficie">
                  Dar desconto ao cliente
                  <span className="block text-apoio text-em-superficie-2">
                    Ex.: pagou à vista no PIX. Só o dono pode dar.
                  </span>
                </span>
              </label>
              {comDesconto && baixando && (
                <div className="pt-4">
                  <CamposDeDesconto
                    d={descontoDaBaixa}
                    falta={
                      Number(baixando.conta.valor) - Number((baixando.conta as ContaAReceber).valor_recebido)
                    }
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      <JanelaDeDesconto conta={descontando} aoFechar={() => setDescontando(null)} />
      <JanelaDeDesfazerDesconto conta={desfazendo} aoFechar={() => setDesfazendo(null)} />

      <Modal
        aberto={corrigindo !== null}
        aoFechar={() => setCorrigindo(null)}
        titulo={corrigindo?.tipo === 'pagar' ? 'Corrigir pagamento' : 'Corrigir recebimento'}
        rodape={
          <Botao largo carregando={corrigir.isPending} onClick={() => corrigir.mutate()}>
            Salvar correção
          </Botao>
        }
      >
        <p className="pb-1 text-corpo text-em-superficie-2">
          {corrigindo?.conta.descricao} — {moeda(corrigindo?.conta.valor ?? 0)}
        </p>
        <p className="pb-4 text-apoio text-em-superficie-2">
          Aqui se conserta o que foi anotado na baixa. O valor da conta em si vem
          da ordem de serviço — para mudar o que o cliente deve, é lá.
        </p>

        <div className="flex flex-col gap-4 pb-2">
          <Selecao
            rotulo="Forma de pagamento"
            value={formaCorrigida}
            onChange={(e) => setFormaCorrigida(e.target.value as FormaPagamento | '')}
          >
            <option value="">Não informar</option>
            {FORMAS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.rotulo}
              </option>
            ))}
          </Selecao>

          <Campo
            rotulo="Data do pagamento"
            type="date"
            value={dataCorrigida}
            onChange={(e) => setDataCorrigida(e.target.value)}
          />

          {corrigindo?.tipo === 'receber' && (
            <Campo
              rotulo="Valor recebido"
              inputMode="decimal"
              dica="Corrigir para menos reabre a conta: o cliente volta a dever a diferença."
              value={valorCorrigido}
              onChange={(e) => setValorCorrigido(e.target.value)}
            />
          )}

          <Campo
            rotulo="Motivo da correção"
            obrigatorio
            placeholder="O cliente mudou de ideia e pagou no cartão"
            dica="Fica registrado com o seu nome. É o que explica a diferença quando alguém for conferir o mês."
            value={motivoCorrecao}
            onChange={(e) => setMotivoCorrecao(e.target.value)}
          />

          {(historico.data ?? []).length > 0 && (
            <div className="rounded-controle bg-acento-suave px-4 py-3">
              <p className="text-apoio font-semibold text-em-superficie">
                Correções anteriores
              </p>
              <ul className="flex flex-col gap-2 pt-2">
                {(historico.data ?? []).map((h) => (
                  <li key={h.id} className="text-apoio text-em-superficie-2">
                    {formatarData(h.criado_em.slice(0, 10))}
                    {h.quem ? ` · ${h.quem}` : ''}: de {comRotulo(h.de)} para{' '}
                    {comRotulo(h.para)}.{' '}
                    <span className="italic">{h.motivo}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>

      <FolhaDeDespesa
        aberto={lancando}
        aoFechar={() => setLancando(false)}
        categorias={oficina?.categorias_despesa ?? []}
        aoSalvar={recarregar}
      />
    </Tela>
  )
}

/** Lançamento de despesa, com a opção de repetir por N meses. */
function FolhaDeDespesa({
  aberto,
  aoFechar,
  categorias,
  aoSalvar,
}: {
  aberto: boolean
  aoFechar: () => void
  categorias: string[]
  aoSalvar: () => void
}) {
  const toast = useToast()
  const [descricao, setDescricao] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [categoria, setCategoria] = useState('')
  const [valor, setValor] = useState('')
  const [vencimento, setVencimento] = useState(() => new Date().toISOString().slice(0, 10))
  const [meses, setMeses] = useState('1')

  const salvar = useMutation({
    mutationFn: () =>
      lancarContaAPagar({
        descricao,
        valor: paraNumero(valor),
        vencimento,
        fornecedor: fornecedor.trim() || null,
        categoria: categoria || null,
        repetirMeses: Number(meses) || 1,
      }),
    onSuccess: (quantas) => {
      aoSalvar()
      aoFechar()
      setDescricao('')
      setFornecedor('')
      setValor('')
      setMeses('1')
      toast.sucesso(quantas > 1 ? `${quantas} despesas lançadas.` : 'Despesa lançada.')
    },
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  const podeSalvar = descricao.trim().length > 1 && paraNumero(valor) > 0

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Lançar despesa"
      rodape={
        <Botao largo disabled={!podeSalvar} carregando={salvar.isPending} onClick={() => salvar.mutate()}>
          Lançar
        </Botao>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <Campo
          rotulo="Descrição"
          obrigatorio
          placeholder="Aluguel do galpão"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
        <Campo
          rotulo="Fornecedor"
          placeholder="Imobiliária Silva"
          value={fornecedor}
          onChange={(e) => setFornecedor(e.target.value)}
        />
        <Selecao
          rotulo="Categoria"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
        >
          <option value="">Sem categoria</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Selecao>
        <Campo
          rotulo="Valor"
          obrigatorio
          inputMode="decimal"
          placeholder="1.800,00"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
        <Campo
          rotulo="Vencimento"
          type="date"
          value={vencimento}
          onChange={(e) => setVencimento(e.target.value)}
        />
        <Campo
          rotulo="Repetir por quantos meses"
          inputMode="numeric"
          dica="Aluguel, salário e internet se repetem. Deixe 1 para uma vez só."
          value={meses}
          onChange={(e) => setMeses(e.target.value.replace(/\D/g, ''))}
        />
      </div>
    </Modal>
  )
}
