import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { Tela, CabecalhoInterno, TituloSecao } from '@/componentes/layout/Tela'
import { Campo, AreaTexto, Interruptor, Selecao } from '@/componentes/ui/Campo'
import { Abas } from '@/componentes/ui/Abas'
import { Botao } from '@/componentes/ui/Botao'
import { Carregando } from '@/componentes/ui/Carregando'
import { EstadoErro } from '@/componentes/ui/EstadoVazio'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { moeda, porcentagem, data as formatarData } from '@/lib/formato'
import { paraNumero } from '@/lib/numero'
import { SeletorClienteMoto, type EscolhaClienteMoto } from '../SeletorClienteMoto'
import { ItensDoOrcamento } from '../ItensDoOrcamento'
import { useAuth } from '@/auth/ProvedorAuth'
import { usePermissoes } from '@/auth/usePermissoes'
import { FORMAS } from '@/funcionalidades/financeiro/api'
import { indicadorPeloCodigo } from '@/funcionalidades/indicadores/api'
import type { FormaPagamento } from '@/tipos/banco'
import {
  obterOrcamento,
  salvarOrcamento,
  lancarServicoAntigo,
  gerarTextoComercial,
  type ItemEmEdicao,
} from '../api'

type TipoDesconto = 'valor' | 'percentual'

/** aaaa-mm-dd no fuso de quem está usando — toISOString daria o dia seguinte depois das 21h. */
function diaLocal(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

const tiposDeDesconto = [
  { id: 'valor', rotulo: 'Em reais' },
  { id: 'percentual', rotulo: 'Em porcento' },
] as const

export function EditorOrcamento() {
  const { id } = useParams<{ id: string }>()
  const editando = Boolean(id)
  const navegar = useNavigate()
  const toast = useToast()
  const cache = useQueryClient()

  const [escolha, setEscolha] = useState<Partial<EscolhaClienteMoto>>({})
  const [km, setKm] = useState('')
  const [itens, setItens] = useState<ItemEmEdicao[]>([])
  const [tipoDesconto, setTipoDesconto] = useState<TipoDesconto>('valor')
  const [desconto, setDesconto] = useState('')
  const [validade, setValidade] = useState('7')
  const [garantia, setGarantia] = useState('90')
  const [observacoes, setObservacoes] = useState('')
  const [maisOpcoes, setMaisOpcoes] = useState(false)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [gerandoTexto, setGerandoTexto] = useState(false)

  // Quem indicou o cliente. O balcão recebe o CÓDIGO ditado pelo cliente, não
  // o nome do parceiro — por isso a busca é por código, e o nome aparece como
  // confirmação de que achou o certo.
  const [codigoIndicador, setCodigoIndicador] = useState('')
  const [indicador, setIndicador] = useState<{
    id: string
    nome: string
    percentual: number
    ativo: boolean
  } | null>(null)
  const [procurandoIndicador, setProcurandoIndicador] = useState(false)
  const [indicadorNaoAchado, setIndicadorNaoAchado] = useState(false)

  // Serviço antigo: o que a oficina fez antes de entrar no sistema. Só o admin,
  // só ao criar — editar a data de algo que já existe não tem caminho nenhum.
  const { oficina } = useAuth()
  const p = usePermissoes()
  const podeLancarAntigo = !editando && p.ehAdmin
  const [servicoAntigo, setServicoAntigo] = useState(false)
  const [dataServico, setDataServico] = useState('')
  const [dataPagamento, setDataPagamento] = useState('')
  const [forma, setForma] = useState<FormaPagamento>('dinheiro')
  const hoje = diaLocal(new Date())
  // O último dia aceito é o de entrada no sistema: dali em diante, tudo já
  // foi registrado com a data real. O banco confere o mesmo.
  const entrouEm = oficina?.criado_em ? diaLocal(new Date(oficina.criado_em)) : hoje
  const ultimoDiaAntigo = entrouEm < hoje ? entrouEm : hoje

  const {
    data: orcamento,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['orcamento', id],
    queryFn: () => obterOrcamento(id!),
    enabled: editando,
  })

  useEffect(() => {
    if (!orcamento) return
    setEscolha({
      clienteId: orcamento.cliente_id,
      clienteNome: orcamento.cliente?.nome ?? '',
      motoId: orcamento.moto_id,
      motoPlaca: orcamento.moto?.placa ?? '',
      motoDescricao: [orcamento.moto?.marca, orcamento.moto?.modelo].filter(Boolean).join(' '),
      motoKm: orcamento.km_registrado ?? 0,
    })
    setKm(orcamento.km_registrado ? String(orcamento.km_registrado) : '')
    setItens(
      orcamento.itens.map((i) => ({
        chave: i.id,
        tipo: i.tipo,
        produto_id: i.produto_id,
        servico_id: i.servico_id,
        descricao: i.descricao,
        quantidade: Number(i.quantidade),
        valor_unitario: Number(i.valor_unitario),
      })),
    )
    if (orcamento.desconto_percentual != null) {
      setTipoDesconto('percentual')
      setDesconto(String(orcamento.desconto_percentual).replace('.', ','))
    } else if (Number(orcamento.desconto) > 0) {
      setTipoDesconto('valor')
      setDesconto(String(orcamento.desconto).replace('.', ','))
    }
    if (orcamento.indicador) {
      setCodigoIndicador(orcamento.indicador.codigo)
      setIndicador({
        id: orcamento.indicador.id,
        nome: orcamento.indicador.nome,
        percentual: 0,
        ativo: true,
      })
    }
    setValidade(String(orcamento.validade_dias))
    setGarantia(String(orcamento.garantia_dias))
    setObservacoes(orcamento.observacoes ?? '')
  }, [orcamento])

  // A moto traz o km que já estava registrado, para não digitar de novo.
  useEffect(() => {
    // No serviço antigo o km de hoje seria mentira: o da época é outro.
    if (!editando && !servicoAntigo && escolha.motoKm != null && km === '') {
      setKm(String(escolha.motoKm))
    }
  }, [escolha.motoKm, editando, km, servicoAntigo])

  const { soma, valorDoDesconto, total } = useMemo(() => {
    const s = itens.reduce((acc, i) => acc + i.quantidade * i.valor_unitario, 0)
    const d = paraNumero(desconto) || 0
    const abatimento = tipoDesconto === 'percentual' ? (s * Math.min(Math.max(d, 0), 100)) / 100 : d
    return {
      soma: s,
      valorDoDesconto: Math.min(abatimento, s),
      total: Math.max(s - abatimento, 0),
    }
  }, [itens, desconto, tipoDesconto])

  const lancarAntigo = useMutation({
    mutationFn: () =>
      lancarServicoAntigo({
        cliente_id: escolha.clienteId!,
        moto_id: escolha.motoId!,
        km_registrado: km ? Number(km.replace(/\D/g, '')) : null,
        garantia_dias: Number(garantia) || 90,
        observacoes: observacoes.trim() || null,
        desconto: valorDoDesconto,
        desconto_percentual: tipoDesconto === 'percentual' ? paraNumero(desconto) || null : null,
        itens,
        data_servico: dataServico,
        data_pagamento: p.verFinanceiro ? dataPagamento : null,
        forma_pagamento: p.verFinanceiro ? forma : null,
      }),
    onSuccess: (novoId) => {
      void cache.invalidateQueries({ queryKey: ['orcamentos'] })
      void cache.invalidateQueries({ queryKey: ['ordens'] })
      void cache.invalidateQueries({ queryKey: ['contas-receber'] })
      void cache.invalidateQueries({ queryKey: ['painel'] })
      toast.sucesso('Serviço antigo lançado.')
      navegar(`/orcamentos/${novoId}`, { replace: true })
    },
    onError: (e) => setErroGeral(traduzirErro(e)),
  })

  async function procurarIndicador(codigo: string) {
    const limpo = codigo.replace(/\s/g, '').toUpperCase()
    setCodigoIndicador(limpo)
    setIndicadorNaoAchado(false)
    if (limpo.length < 2) return setIndicador(null)

    setProcurandoIndicador(true)
    try {
      const achado = await indicadorPeloCodigo(limpo)
      setIndicador(achado)
      setIndicadorNaoAchado(achado === null)
    } catch {
      // Sem internet, não trava o orçamento: segue sem indicador, e o código
      // pode ser anotado depois.
      setIndicador(null)
    } finally {
      setProcurandoIndicador(false)
    }
  }

  const salvar = useMutation({
    mutationFn: () =>
      salvarOrcamento({
        id: id ?? null,
        cliente_id: escolha.clienteId!,
        moto_id: escolha.motoId!,
        km_registrado: km ? Number(km.replace(/\D/g, '')) : null,
        validade_dias: Number(validade) || 7,
        garantia_dias: Number(garantia) || 90,
        observacoes: observacoes.trim() || null,
        desconto: valorDoDesconto,
        desconto_percentual: tipoDesconto === 'percentual' ? paraNumero(desconto) || null : null,
        itens,
        indicador_id: indicador?.id ?? null,
      }),
    onSuccess: (novoId) => {
      void cache.invalidateQueries({ queryKey: ['orcamentos'] })
      void cache.invalidateQueries({ queryKey: ['orcamento', novoId] })
      void cache.invalidateQueries({ queryKey: ['motos'] })
      toast.sucesso(editando ? 'Orçamento atualizado.' : 'Orçamento criado.')
      navegar(`/orcamentos/${novoId}`, { replace: true })
    },
    onError: (e) => setErroGeral(traduzirErro(e)),
  })

  /**
   * Uso opcional do admin/vendedor: nunca dispara sozinho. Some com o que já
   * estiver escrito, em vez de apagar — se a pessoa já tinha digitado algo.
   */
  async function gerarComIA() {
    if (itens.length === 0) {
      setErroGeral('Adicione pelo menos um item antes de gerar o texto.')
      return
    }
    setErroGeral(null)
    setGerandoTexto(true)
    try {
      const texto = await gerarTextoComercial({
        itens: itens.map((i) => ({
          descricao: i.descricao,
          tipo: i.tipo,
          quantidade: i.quantidade,
          valor_unitario: i.valor_unitario,
        })),
        desconto: valorDoDesconto,
        total,
      })
      setObservacoes((atual) => (atual.trim() ? `${atual.trim()}\n\n${texto}` : texto))
      setMaisOpcoes(true)
      toast.sucesso('Texto gerado. Revise antes de enviar ao cliente.')
    } catch (e) {
      toast.erro(traduzirErro(e))
    } finally {
      setGerandoTexto(false)
    }
  }

  function enviar() {
    setErroGeral(null)
    if (!escolha.clienteId) return setErroGeral('Escolha o cliente.')
    if (!escolha.motoId) return setErroGeral('Escolha a moto.')
    if (itens.length === 0) return setErroGeral('Adicione pelo menos um item ao orçamento.')
    if (servicoAntigo) {
      if (!dataServico) return setErroGeral('Informe a data em que o serviço foi feito.')
      if (dataServico > ultimoDiaAntigo) {
        return setErroGeral(
          `Serviço antigo é para o que foi feito até ${formatarData(ultimoDiaAntigo)}, ` +
            'quando a oficina entrou no sistema. Depois disso, use o orçamento normal.',
        )
      }
      if (p.verFinanceiro) {
        if (!dataPagamento) return setErroGeral('Informe quando o cliente pagou.')
        if (dataPagamento < dataServico || dataPagamento > hoje) {
          return setErroGeral('A data do pagamento tem que ser entre a data do serviço e hoje.')
        }
      }
      return lancarAntigo.mutate()
    }
    salvar.mutate()
  }

  if (editando && isPending) return <Carregando />
  if (editando && isError) return <EstadoErro aoTentarDeNovo={() => void refetch()} />

  return (
    <Tela comRodapeFixo>
      <CabecalhoInterno
        titulo={
          editando && orcamento
            ? `Orçamento ${String(orcamento.numero).padStart(3, '0')}`
            : servicoAntigo
              ? 'Serviço antigo'
              : 'Novo orçamento'
        }
        contexto={editando ? 'Editando' : 'Cliente, moto e itens'}
      />

      {podeLancarAntigo && (
        <div className="mb-4 flex flex-col gap-4 rounded-card bg-superficie p-5 shadow-card">
          <Interruptor
            rotulo="Serviço antigo, já feito e pago"
            descricao="Para registrar o que a oficina fez antes de usar o sistema."
            marcado={servicoAntigo}
            aoMudar={(ligado) => {
              setServicoAntigo(ligado)
              setErroGeral(null)
              // O km que veio do cadastro é o de hoje, não o da época.
              if (ligado && km === String(escolha.motoKm ?? '')) setKm('')
            }}
          />
          {servicoAntigo && (
            <>
              <Campo
                rotulo="Data do serviço"
                obrigatorio
                type="date"
                max={ultimoDiaAntigo}
                value={dataServico}
                onChange={(e) => {
                  setDataServico(e.target.value)
                  // O caso comum é pagar no dia: já sugere, sem impedir de mudar.
                  if (!dataPagamento || dataPagamento < e.target.value) {
                    setDataPagamento(e.target.value)
                  }
                }}
              />
              {p.verFinanceiro && (
                <div className="grid grid-cols-2 gap-3">
                  <Campo
                    rotulo="Pago em"
                    obrigatorio
                    type="date"
                    min={dataServico || undefined}
                    max={hoje}
                    value={dataPagamento}
                    onChange={(e) => setDataPagamento(e.target.value)}
                  />
                  <Selecao
                    rotulo="Forma"
                    value={forma}
                    onChange={(e) => setForma(e.target.value as FormaPagamento)}
                  >
                    {FORMAS.filter((f) => f.id !== 'prazo').map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.rotulo}
                      </option>
                    ))}
                  </Selecao>
                </div>
              )}
              <p className="text-apoio text-em-superficie-2">
                Entra direto como aprovado, entregue
                {p.verFinanceiro ? ' e pago' : ''}, com a data de quando aconteceu.{' '}
                <strong>Não mexe no estoque</strong> — as peças saíram na época. Vale para serviços
                até {formatarData(ultimoDiaAntigo)}.
              </p>
            </>
          )}
        </div>
      )}

      <SeletorClienteMoto
        escolha={escolha}
        aoEscolher={(m) => setEscolha((a) => ({ ...a, ...m }))}
      />

      {escolha.motoId && (
        <div className="pt-4">
          <div className="rounded-card bg-superficie p-5 shadow-card">
            <Campo
              rotulo={servicoAntigo ? 'Quilometragem na época' : 'Quilometragem hoje'}
              inputMode="numeric"
              placeholder="12000"
              dica={
                servicoAntigo
                  ? 'Opcional. Se não souber, deixe em branco.'
                  : 'Como está no painel agora. Atualiza o cadastro da moto.'
              }
              value={km}
              onChange={(e) => setKm(e.target.value.replace(/\D/g, ''))}
            />
          </div>
        </div>
      )}

      <TituloSecao>Itens</TituloSecao>
      <ItensDoOrcamento itens={itens} aoMudar={setItens} />

      {itens.length > 0 && (
        <>
          <TituloSecao>Desconto</TituloSecao>
          <div className="flex flex-col gap-3 rounded-card bg-superficie p-5 shadow-card">
            <Abas
              rotulo="Tipo de desconto"
              abas={tiposDeDesconto}
              ativa={tipoDesconto}
              aoTrocar={setTipoDesconto}
            />
            <Campo
              rotulo={tipoDesconto === 'valor' ? 'Valor do desconto' : 'Percentual de desconto'}
              inputMode="decimal"
              placeholder={tipoDesconto === 'valor' ? '20,00' : '10'}
              value={desconto}
              onChange={(e) => setDesconto(e.target.value)}
            />
            {valorDoDesconto > 0 && (
              <p className="text-apoio text-em-superficie-2">
                Abate {moeda(valorDoDesconto)} de {moeda(soma)}.
              </p>
            )}
          </div>
        </>
      )}

      {/* Validade, garantia e observações têm padrão bom e raramente mudam:
          ficam recolhidas para não alongar a tela do caso comum. */}
      <button
        type="button"
        onClick={() => setMaisOpcoes((v) => !v)}
        className="mt-6 flex min-h-toque w-full items-center justify-between gap-3 rounded-controle border border-borda-em-fundo px-4 text-em-fundo"
      >
        <span className="text-corpo font-medium">
          {servicoAntigo ? 'Garantia e observações' : 'Validade, garantia e observações'}
        </span>
        {maisOpcoes ? <ChevronUp aria-hidden size={20} /> : <ChevronDown aria-hidden size={20} />}
      </button>

      {maisOpcoes && (
        <div className="mt-3 flex flex-col gap-4 rounded-card bg-superficie p-5 shadow-card">
          <div className="grid grid-cols-2 gap-3">
            {/* Validade não significa nada para o que já foi aprovado e feito. */}
            {!servicoAntigo && (
              <Campo
                rotulo="Validade"
                inputMode="numeric"
                dica="Dias"
                value={validade}
                onChange={(e) => setValidade(e.target.value.replace(/\D/g, ''))}
              />
            )}
            <Campo
              rotulo="Garantia"
              inputMode="numeric"
              dica="Dias"
              value={garantia}
              onChange={(e) => setGarantia(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          {/* Quem indicou. Fica aqui dentro porque a maioria dos orçamentos não
              tem indicação — e quando tem, o cliente diz o código logo na
              chegada. */}
          <Campo
            rotulo="Indicado por (código)"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="JOAOMOTOS"
            className="uppercase tracking-wide"
            dica={
              procurandoIndicador
                ? 'Procurando…'
                : indicador
                  ? `${indicador.nome}${indicador.ativo ? '' : ' (inativo)'} · comissão de ${porcentagem(indicador.percentual)}`
                  : indicadorNaoAchado
                    ? 'Nenhum indicador com esse código. Confira, ou cadastre em Indicadores.'
                    : 'Opcional. O código que o cliente falou.'
            }
            erro={indicadorNaoAchado ? ' ' : undefined}
            value={codigoIndicador}
            onChange={(e) => void procurarIndicador(e.target.value)}
          />

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void gerarComIA()}
              disabled={gerandoTexto || itens.length === 0}
              className="flex min-h-toque w-fit items-center gap-1.5 self-end rounded-badge bg-acento-suave px-3 text-apoio font-medium text-em-superficie disabled:opacity-50"
            >
              <Sparkles
                aria-hidden
                size={14}
                className={gerandoTexto ? 'animate-pulse' : undefined}
              />
              {gerandoTexto ? 'Gerando…' : 'Gerar com IA'}
            </button>
            <AreaTexto
              rotulo="Observações"
              placeholder="O que o cliente precisa saber"
              dica="Opcional. O botão acima monta um texto de venda a partir dos itens — sempre revise antes de mandar."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </div>
        </div>
      )}

      {erroGeral && (
        <p
          role="alert"
          className="mt-4 rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro-forte"
        >
          {erroGeral}
        </p>
      )}

      {/* O total acompanha a rolagem: em oficina, o número que importa é esse, e
          ele não pode ficar escondido no fim da tela. */}
      {/* Fundo opaco, pelo mesmo motivo da barra de abas: este rodapé fica por
          cima dos cards brancos dos itens, e com 5% de transparência o branco
          atravessava e lavava o total e o botão — justamente os dois números
          que a pessoa precisa ver antes de mandar o orçamento. */}
      <div className="fixed inset-x-0 bottom-[calc(var(--altura-tabbar)+env(safe-area-inset-bottom))] z-30 border-t border-borda-em-fundo bg-fundo px-5 py-3">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-rotulo text-em-fundo-2">
              {itens.length} {itens.length === 1 ? 'item' : 'itens'}
              {valorDoDesconto > 0 && ` · −${moeda(valorDoDesconto)}`}
            </span>
            <span className="text-titulo text-acento-forte">{moeda(total)}</span>
          </div>
          <Botao largo carregando={salvar.isPending || lancarAntigo.isPending} onClick={enviar}>
            {editando
              ? 'Salvar alterações'
              : servicoAntigo
                ? 'Lançar serviço antigo'
                : 'Criar orçamento'}
          </Botao>
        </div>
      </div>
    </Tela>
  )
}
