import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { Tela, CabecalhoInterno, TituloSecao } from '@/componentes/layout/Tela'
import { Campo, AreaTexto } from '@/componentes/ui/Campo'
import { Abas } from '@/componentes/ui/Abas'
import { Botao } from '@/componentes/ui/Botao'
import { Carregando } from '@/componentes/ui/Carregando'
import { EstadoErro } from '@/componentes/ui/EstadoVazio'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { moeda } from '@/lib/formato'
import { paraNumero } from '@/lib/numero'
import { SeletorClienteMoto, type EscolhaClienteMoto } from '../SeletorClienteMoto'
import { ItensDoOrcamento } from '../ItensDoOrcamento'
import { obterOrcamento, salvarOrcamento, gerarTextoComercial, type ItemEmEdicao } from '../api'

type TipoDesconto = 'valor' | 'percentual'

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

  const { data: orcamento, isPending, isError, refetch } = useQuery({
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
    setValidade(String(orcamento.validade_dias))
    setGarantia(String(orcamento.garantia_dias))
    setObservacoes(orcamento.observacoes ?? '')
  }, [orcamento])

  // A moto traz o km que já estava registrado, para não digitar de novo.
  useEffect(() => {
    if (!editando && escolha.motoKm != null && km === '') setKm(String(escolha.motoKm))
  }, [escolha.motoKm, editando, km])

  const { soma, valorDoDesconto, total } = useMemo(() => {
    const s = itens.reduce((acc, i) => acc + i.quantidade * i.valor_unitario, 0)
    const d = paraNumero(desconto) || 0
    const abatimento =
      tipoDesconto === 'percentual' ? (s * Math.min(Math.max(d, 0), 100)) / 100 : d
    return {
      soma: s,
      valorDoDesconto: Math.min(abatimento, s),
      total: Math.max(s - abatimento, 0),
    }
  }, [itens, desconto, tipoDesconto])

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
    salvar.mutate()
  }

  if (editando && isPending) return <Carregando />
  if (editando && isError) return <EstadoErro aoTentarDeNovo={() => void refetch()} />

  return (
    <Tela className="pb-[calc(var(--altura-tabbar)+132px+env(safe-area-inset-bottom))]">
      <CabecalhoInterno
        titulo={
          editando && orcamento
            ? `Orçamento ${String(orcamento.numero).padStart(3, '0')}`
            : 'Novo orçamento'
        }
        contexto={editando ? 'Editando' : 'Cliente, moto e itens'}
      />

      <SeletorClienteMoto escolha={escolha} aoEscolher={(m) => setEscolha((a) => ({ ...a, ...m }))} />

      {escolha.motoId && (
        <div className="pt-4">
          <div className="rounded-card bg-superficie p-5 shadow-card">
            <Campo
              rotulo="Quilometragem hoje"
              inputMode="numeric"
              placeholder="12000"
              dica="Como está no painel agora. Atualiza o cadastro da moto."
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
              <p className="text-apoio text-claro-secundario">
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
        className="mt-6 flex min-h-toque w-full items-center justify-between gap-3 rounded-controle border border-borda-escura px-4 text-escuro"
      >
        <span className="text-corpo font-medium">Validade, garantia e observações</span>
        {maisOpcoes ? (
          <ChevronUp aria-hidden size={20} />
        ) : (
          <ChevronDown aria-hidden size={20} />
        )}
      </button>

      {maisOpcoes && (
        <div className="mt-3 flex flex-col gap-4 rounded-card bg-superficie p-5 shadow-card">
          <div className="grid grid-cols-2 gap-3">
            <Campo
              rotulo="Validade"
              inputMode="numeric"
              dica="Dias"
              value={validade}
              onChange={(e) => setValidade(e.target.value.replace(/\D/g, ''))}
            />
            <Campo
              rotulo="Garantia"
              inputMode="numeric"
              dica="Dias"
              value={garantia}
              onChange={(e) => setGarantia(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void gerarComIA()}
              disabled={gerandoTexto || itens.length === 0}
              className="flex min-h-toque w-fit items-center gap-1.5 self-end rounded-badge bg-acento-suave px-3 text-apoio font-medium text-claro disabled:opacity-50"
            >
              <Sparkles aria-hidden size={14} className={gerandoTexto ? 'animate-pulse' : undefined} />
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
          className="mt-4 rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro"
        >
          {erroGeral}
        </p>
      )}

      {/* O total acompanha a rolagem: em oficina, o número que importa é esse, e
          ele não pode ficar escondido no fim da tela. */}
      <div className="fixed inset-x-0 bottom-[calc(var(--altura-tabbar)+env(safe-area-inset-bottom))] z-30 border-t border-borda-escura bg-fundo/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-rotulo text-escuro-secundario">
              {itens.length} {itens.length === 1 ? 'item' : 'itens'}
              {valorDoDesconto > 0 && ` · −${moeda(valorDoDesconto)}`}
            </span>
            <span className="text-titulo text-acento">{moeda(total)}</span>
          </div>
          <Botao largo carregando={salvar.isPending} onClick={enviar}>
            {editando ? 'Salvar alterações' : 'Criar orçamento'}
          </Botao>
        </div>
      </div>
    </Tela>
  )
}
