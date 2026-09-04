import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { User, Bike, Play, Pause, CheckCircle2, Circle } from 'lucide-react'
import { Tela, CabecalhoInterno, TituloSecao } from '@/componentes/layout/Tela'
import { Card } from '@/componentes/ui/Card'
import { Botao } from '@/componentes/ui/Botao'
import { AreaTexto } from '@/componentes/ui/Campo'
import { Carregando } from '@/componentes/ui/Carregando'
import { EstadoErro } from '@/componentes/ui/EstadoVazio'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { exibirPlaca, data, quilometragem } from '@/lib/formato'
import { StatusOsBadge } from '../StatusOsBadge'
import { Cronometro } from '../Cronometro'
import { mudarStatusDaOs, tempoDaOs, salvarObservacoesTecnicas } from '../api'
import { osDoMecanico, marcarItemExecutado } from '../apiDoMecanico'
import type { StatusOS } from '@/tipos/banco'

/**
 * A ordem como o mecânico a vê: a moto, o que fazer, o relógio e o que ele
 * anotou. Sem valor, sem cliente de outra ordem, sem financeiro — e isso não é
 * a tela escondendo: o banco não manda (migration 0033).
 *
 * É uma tela separada da do atendimento de propósito. A mesma tela com uma
 * dúzia de "se for mecânico" acabaria mostrando algo a mais no dia em que
 * alguém esquecesse um deles.
 */
export function OrdemDoMecanico() {
  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()
  const toast = useToast()
  const cache = useQueryClient()

  const { data: ordem, isPending, isError } = useQuery({
    queryKey: ['os-do-mecanico', id],
    queryFn: () => osDoMecanico(id!),
  })

  const { data: tempo } = useQuery({
    queryKey: ['tempo-da-os', id],
    queryFn: () => tempoDaOs(id!),
  })

  const [anotacao, setAnotacao] = useState('')
  const [anotacaoSuja, setAnotacaoSuja] = useState(false)

  useEffect(() => {
    if (!ordem) return
    setAnotacao((antes) => (anotacaoSuja ? antes : (ordem.observacoes_tecnicas ?? '')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordem])

  function recarregar() {
    void cache.invalidateQueries({ queryKey: ['os-do-mecanico'] })
    void cache.invalidateQueries({ queryKey: ['tempo-da-os'] })
    void cache.invalidateQueries({ queryKey: ['ordens-do-mecanico'] })
  }

  const mudar = useMutation({
    mutationFn: (status: StatusOS) => mudarStatusDaOs(id!, status),
    onSuccess: ({ pausouAOrdem }) => {
      recarregar()
      if (pausouAOrdem) {
        toast.aviso(
          `A OS ${pausouAOrdem.padStart(3, '0')} foi pausada: você só pode estar em uma moto por vez.`,
        )
      }
    },
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  const marcar = useMutation({
    mutationFn: ({ itemId, feito }: { itemId: string; feito: boolean }) =>
      marcarItemExecutado(itemId, feito),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['os-do-mecanico', id] }),
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  const anotar = useMutation({
    mutationFn: () => salvarObservacoesTecnicas(id!, anotacao),
    onSuccess: () => {
      setAnotacaoSuja(false)
      void cache.invalidateQueries({ queryKey: ['os-do-mecanico', id] })
      toast.sucesso('Anotação salva.')
    },
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  if (isPending) return <Carregando />
  if (isError) {
    return (
      <EstadoErro
        titulo="Esta ordem não está com você"
        descricao="Só aparecem aqui as motos atribuídas a você. Volte para a sua lista."
        aoTentarDeNovo={() => navegar('/', { replace: true })}
      />
    )
  }
  const modelo = [ordem.marca, ordem.modelo].filter(Boolean).join(' ')
  const feitos = ordem.itens.filter((i) => i.executado_em).length
  const podeMexer = ['aberta', 'em_andamento', 'pausada', 'aguardando_conferencia'].includes(
    ordem.status,
  )

  return (
    <Tela>
      <CabecalhoInterno
        titulo={`OS ${String(ordem.numero).padStart(3, '0')}`}
        contexto={`Aberta em ${data(ordem.data_abertura)}`}
        acao={<StatusOsBadge status={ordem.status} />}
      />

      <Card>
        <div className="flex items-center gap-3 pb-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-acento-suave">
            <Bike aria-hidden size={20} className="text-claro" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-secao text-claro">
              {ordem.placa ? exibirPlaca(ordem.placa) : 'Moto removida'}
            </p>
            <p className="truncate text-apoio text-claro-secundario">
              {modelo}
              {ordem.km_entrada ? ` · ${quilometragem(ordem.km_entrada)}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-borda-clara pt-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-acento-suave">
            <User aria-hidden size={20} className="text-claro" />
          </span>
          <p className="truncate text-corpo text-claro">{ordem.cliente_nome ?? '—'}</p>
        </div>
      </Card>

      {tempo && (
        <div className="pt-6">
          <Cronometro tempo={tempo} />
        </div>
      )}

      {/* O botão do andamento é o maior da tela: é o que a mão suja procura. */}
      <div className="flex flex-col gap-3 pt-6">
        {ordem.status === 'aberta' && (
          <Botao
            largo
            carregando={mudar.isPending}
            icone={<Play aria-hidden size={20} />}
            onClick={() => mudar.mutate('em_andamento')}
          >
            Começar
          </Botao>
        )}
        {ordem.status === 'em_andamento' && (
          <>
            <Botao
              largo
              carregando={mudar.isPending}
              icone={<CheckCircle2 aria-hidden size={20} />}
              onClick={() => mudar.mutate('aguardando_conferencia')}
            >
              Terminei
            </Botao>
            <Botao
              largo
              variante="contorno"
              carregando={mudar.isPending}
              icone={<Pause aria-hidden size={20} />}
              onClick={() => mudar.mutate('pausada')}
            >
              Pausar
            </Botao>
          </>
        )}
        {ordem.status === 'pausada' && (
          <Botao
            largo
            carregando={mudar.isPending}
            icone={<Play aria-hidden size={20} />}
            onClick={() => mudar.mutate('em_andamento')}
          >
            Voltar ao serviço
          </Botao>
        )}
        {ordem.status === 'aguardando_conferencia' && (
          <p className="rounded-controle bg-atencao-fundo px-4 py-3 text-corpo text-atencao">
            Avisado que está pronta. Quem confere o serviço é que finaliza.
          </p>
        )}
      </div>

      <TituloSecao>
        O que fazer {ordem.itens.length > 0 && `(${feitos} de ${ordem.itens.length})`}
      </TituloSecao>
      <div className="flex flex-col gap-3">
        {ordem.itens.map((item) => {
          const feito = Boolean(item.executado_em)
          return (
            <button
              key={item.id}
              type="button"
              disabled={!podeMexer || marcar.isPending}
              onClick={() => marcar.mutate({ itemId: item.id, feito: !feito })}
              className="flex items-start gap-3 rounded-card bg-superficie p-4 text-left shadow-card disabled:opacity-60"
            >
              {feito ? (
                <CheckCircle2 aria-hidden size={24} className="mt-0.5 shrink-0 text-sucesso" />
              ) : (
                <Circle aria-hidden size={24} className="mt-0.5 shrink-0 text-claro-secundario" />
              )}
              <span className="min-w-0">
                <span
                  className={`block text-corpo font-medium ${
                    feito ? 'text-claro-secundario line-through' : 'text-claro'
                  }`}
                >
                  {item.descricao}
                </span>
                <span className="block text-apoio text-claro-secundario">
                  {item.tipo === 'produto' ? 'Peça' : item.tipo === 'servico' ? 'Serviço' : 'Item'}
                  {Number(item.quantidade) !== 1 &&
                    ` · ${String(item.quantidade).replace('.', ',')} unidades`}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <TituloSecao>Suas anotações</TituloSecao>
      <div className="flex flex-col gap-3 rounded-card bg-superficie p-5 shadow-card">
        <AreaTexto
          rotulo="O que você viu na moto"
          placeholder="Corrente folgada, ajustei. Pastilha traseira precisa trocar na próxima."
          dica="Quem atende o cliente lê isto, e sai no comprovante."
          value={anotacao}
          disabled={!podeMexer}
          onChange={(e) => {
            setAnotacao(e.target.value)
            setAnotacaoSuja(true)
          }}
        />
        {anotacaoSuja && (
          <Botao
            largo
            variante="contorno-no-card"
            carregando={anotar.isPending}
            onClick={() => anotar.mutate()}
          >
            Salvar anotação
          </Botao>
        )}
      </div>
    </Tela>
  )
}
