import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, QrCode, CheckCircle2, Wallet } from 'lucide-react'
import { Tela, CabecalhoTela, TituloSecao } from '@/componentes/layout/Tela'
import { Abas } from '@/componentes/ui/Abas'
import { Card } from '@/componentes/ui/Card'
import { ListaResponsiva } from '@/componentes/ui/ListaResponsiva'
import { Badge } from '@/componentes/ui/Badge'
import { Botao } from '@/componentes/ui/Botao'
import { Campo, Selecao } from '@/componentes/ui/Campo'
import { Modal } from '@/componentes/ui/Modal'
import { EstadoVazio, EstadoErro } from '@/componentes/ui/EstadoVazio'
import { EsqueletoLista } from '@/componentes/ui/Carregando'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { paraNumero } from '@/lib/numero'
import { moeda, data as formatarData } from '@/lib/formato'
import { useAuth } from '@/auth/ProvedorAuth'
import { CobrancaPix } from '../CobrancaPix'
import {
  listarContasAReceber,
  listarContasAPagar,
  receberConta,
  pagarConta,
  lancarContaAPagar,
  statusDaConta,
  rotuloDaForma,
  resumo,
  FORMAS,
  type ContaAReceber,
  type FiltroDeContas,
} from '../api'
import type { ContaPagar, FormaPagamento, StatusConta } from '@/tipos/banco'

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
      <span className="text-rotulo text-claro-secundario">{rotulo}</span>
      <span className={`text-corpo font-medium desktop:text-secao ${tom ?? 'text-claro'}`}>
        {valor}
      </span>
    </div>
  )
}

export function Financeiro() {
  const toast = useToast()
  const cache = useQueryClient()
  const { oficina } = useAuth()

  const [aba, setAba] = useState<'receber' | 'pagar'>('receber')
  const [status, setStatus] = useState<StatusConta | 'todas'>('todas')
  const [periodo, setPeriodo] = useState(mesCorrente)

  const [cobrando, setCobrando] = useState<ContaAReceber | null>(null)
  const [baixando, setBaixando] = useState<{ conta: ContaAReceber | ContaPagar; tipo: 'receber' | 'pagar' } | null>(null)
  const [valorDaBaixa, setValorDaBaixa] = useState('')
  const [formaDaBaixa, setFormaDaBaixa] = useState<FormaPagamento | ''>('')
  const [lancando, setLancando] = useState(false)

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
      if (!baixando) return
      const hoje = new Date().toISOString().slice(0, 10)
      const forma = formaDaBaixa || null
      if (baixando.tipo === 'receber') {
        const parcial = paraNumero(valorDaBaixa)
        await receberConta(baixando.conta.id, parcial > 0 ? parcial : null, hoje, forma)
      } else {
        await pagarConta(baixando.conta.id, hoje, forma)
      }
    },
    onSuccess: () => {
      setBaixando(null)
      setValorDaBaixa('')
      setFormaDaBaixa('')
      recarregar()
      toast.sucesso('Baixa registrada.')
    },
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  const numeros = resumo(receber.data ?? [], pagar.data ?? [])
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
          <LinhaResumo rotulo="Em atraso" valor={moeda(numeros.atrasado)} tom="text-erro" />
        )}
        <LinhaResumo rotulo="Já recebido" valor={moeda(numeros.recebido)} tom="text-sucesso" />
        <LinhaResumo rotulo="A pagar no período" valor={moeda(numeros.aPagar)} />
        <div className="flex items-baseline justify-between gap-4 border-t border-borda-clara pt-3 desktop:col-span-4">
          <span className="text-secao text-claro">Saldo previsto</span>
          <span
            className={`text-destaque ${numeros.saldo < 0 ? 'text-erro' : 'text-claro'}`}
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
              type="date"
              value={periodo.de}
              onChange={(e) => setPeriodo((p) => ({ ...p, de: e.target.value }))}
            />
          </div>
          <div className="flex-1 desktop:w-40 desktop:flex-none">
            <Campo
              rotulo="Até"
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
                        <p className="truncate text-corpo font-medium text-claro">{c.descricao}</p>
                        <p className="truncate text-apoio text-claro-secundario">
                          {c.cliente?.nome ?? 'sem cliente'} · vence {formatarData(c.vencimento)}
                        </p>
                      </div>
                      <Badge tom={tomDoStatus[efetivo]}>{rotuloDoStatus[efetivo]}</Badge>
                    </div>

                    <div className="flex items-baseline justify-between gap-4 pt-3">
                      <span className="text-apoio text-claro-secundario">
                        {Number(c.valor_recebido) > 0 && efetivo !== 'paga'
                          ? `${moeda(c.valor_recebido)} de ${moeda(c.valor)} · faltam ${moeda(falta)}`
                          : rotuloDaForma(c.forma_pagamento)}
                      </span>
                      <span className="text-corpo font-semibold text-claro">{moeda(c.valor)}</span>
                    </div>

                    {efetivo !== 'paga' && efetivo !== 'cancelada' && (
                      <div className="flex flex-col gap-2 border-t border-borda-clara pt-3 mt-3">
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
                          icone={<CheckCircle2 aria-hidden size={20} />}
                          onClick={() => {
                            setBaixando({ conta: c, tipo: 'receber' })
                            setValorDaBaixa('')
                            setFormaDaBaixa(c.forma_pagamento ?? '')
                          }}
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
                    {Number(c.valor_recebido) > 0 && statusDaConta(c) !== 'paga' && (
                      <span className="block text-apoio font-normal text-claro-secundario">
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
                  if (e === 'paga' || e === 'cancelada') return null
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
                        icone={<CheckCircle2 aria-hidden size={18} />}
                        onClick={() => {
                          setBaixando({ conta: c, tipo: 'receber' })
                          setValorDaBaixa('')
                          setFormaDaBaixa(c.forma_pagamento ?? '')
                        }}
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
                        <p className="truncate text-corpo font-medium text-claro">{c.descricao}</p>
                        <p className="truncate text-apoio text-claro-secundario">
                          {[c.fornecedor, c.categoria].filter(Boolean).join(' · ') || 'sem categoria'}
                          {` · vence ${formatarData(c.vencimento)}`}
                        </p>
                      </div>
                      <Badge tom={tomDoStatus[efetivo]}>{rotuloDoStatus[efetivo]}</Badge>
                    </div>

                    <div className="flex items-baseline justify-between gap-4 pt-3">
                      <span className="text-apoio text-claro-secundario">
                        {rotuloDaForma(c.forma_pagamento)}
                      </span>
                      <span className="text-corpo font-semibold text-claro">{moeda(c.valor)}</span>
                    </div>

                    {efetivo !== 'paga' && efetivo !== 'cancelada' && (
                      <div className="border-t border-borda-clara pt-3 mt-3">
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
                  if (e === 'paga' || e === 'cancelada') return null
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
        <p className="pb-4 text-corpo text-claro-secundario">
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
              dica="Recebeu só uma parte? Digite quanto entrou — a conta continua aberta com o saldo."
              value={valorDaBaixa}
              onChange={(e) => setValorDaBaixa(e.target.value)}
            />
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
