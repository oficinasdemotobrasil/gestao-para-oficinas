import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, ImagePlus, Trash2, ClipboardCheck, TriangleAlert } from 'lucide-react'
import { TituloSecao } from '@/componentes/layout/Tela'
import { Card } from '@/componentes/ui/Card'
import { Botao } from '@/componentes/ui/Botao'
import { Modal } from '@/componentes/ui/Modal'
import { AreaTexto, Campo } from '@/componentes/ui/Campo'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { dataHora } from '@/lib/formato'
import { cn } from '@/lib/cn'
import { useAuth } from '@/auth/ProvedorAuth'
import { usePermissoes } from '@/auth/usePermissoes'
import type { Combustivel, MomentoDaFoto, OsVistoria, StatusOS } from '@/tipos/banco'
import {
  FOTOS_POR_ORDEM,
  ROTULO_DO_MOMENTO,
  apagarFoto,
  ehLimiteDoPlano,
  enviarFoto,
  listarFotos,
  momentoSugerido,
  obterVistoria,
  salvarVistoria,
  usoDeFotos,
  type FotoComEndereco,
} from './api'
import { ITENS_DA_VISTORIA, NIVEIS_DE_COMBUSTIVEL } from './vistoria'

/**
 * Fotos e vistoria de entrada de uma OS (migration 0079).
 *
 * Fica igual na tela de quem atende e na do mecânico — é ele quem vê o defeito
 * na bancada. As regras (quem pode, quantas, até quando) estão no banco; aqui
 * só se esconde o botão que não ia funcionar.
 */
export function RegistroDaOrdem({ ordemId, status }: { ordemId: string; status: StatusOS }) {
  const { oficina } = useAuth()
  const p = usePermissoes()
  const toast = useToast()
  const cache = useQueryClient()
  const navegar = useNavigate()

  /*
   * Cinco minutos de validade, e não os 30 segundos do app: cada leitura gera
   * endereços temporários novos, e endereço novo faz o navegador baixar as
   * miniaturas de novo. Foto enviada ou apagada nesta tela invalida na hora.
   */
  const fotos = useQuery({
    queryKey: ['fotos', ordemId],
    queryFn: () => listarFotos(ordemId),
    staleTime: 5 * 60_000,
  })
  const vistoria = useQuery({ queryKey: ['vistoria', ordemId], queryFn: () => obterVistoria(ordemId) })
  const uso = useQuery({ queryKey: ['uso-de-fotos'], queryFn: usoDeFotos })

  const [momento, setMomento] = useState<MomentoDaFoto>(() => momentoSugerido(status))
  const [vendo, setVendo] = useState<FotoComEndereco | null>(null)
  const [noLimiteDoPlano, setNoLimiteDoPlano] = useState(false)
  const [fazendoVistoria, setFazendoVistoria] = useState(false)
  const [perguntando, setPerguntando] = useState(false)
  const camera = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)

  // O momento acompanha o andamento: quem abre a OS na entrega já cai em
  // "Entrega", sem precisar trocar.
  useEffect(() => setMomento(momentoSugerido(status)), [status])

  /*
   * A pergunta ao iniciar o serviço.
   *
   * É o momento em que a moto está na frente da pessoa — na aprovação, muitas
   * vezes ela nem chegou. A pergunta aparece só na passagem de "aberta" para
   * "em andamento" vista NESTA tela, e só se nada da entrada foi registrado
   * ainda. Abrir uma OS que já estava em andamento não pergunta nada.
   */
  const statusAnterior = useRef(status)
  useEffect(() => {
    const antes = statusAnterior.current
    statusAnterior.current = status
    if (antes !== 'aberta' || status !== 'em_andamento') return
    const temEntrada = (fotos.data ?? []).some((f) => f.momento === 'entrada')
    if (!vistoria.data && !temEntrada) setPerguntando(true)
  }, [status, fotos.data, vistoria.data])

  function recarregarFotos() {
    void cache.invalidateQueries({ queryKey: ['fotos', ordemId] })
    void cache.invalidateQueries({ queryKey: ['uso-de-fotos'] })
  }

  const enviar = useMutation({
    mutationFn: (arquivo: File) =>
      enviarFoto({ oficinaId: oficina!.id, ordemId, momento, arquivo }),
    onSuccess: () => {
      recarregarFotos()
      toast.sucesso('Foto guardada.')
    },
    onError: (e) => {
      if (ehLimiteDoPlano(e)) {
        setNoLimiteDoPlano(true)
        void cache.invalidateQueries({ queryKey: ['uso-de-fotos'] })
        return
      }
      toast.erro(traduzirErro(e))
    },
  })

  const apagar = useMutation({
    mutationFn: apagarFoto,
    onSuccess: () => {
      setVendo(null)
      recarregarFotos()
      toast.sucesso('Foto apagada.')
    },
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    // Limpa já: escolher a mesma foto duas vezes seguidas não dispararia o
    // evento de novo.
    e.target.value = ''
    if (arquivo) enviar.mutate(arquivo)
  }

  // As duas leituras falhando juntas é o banco ainda sem a 0079 (o app pode
  // ser publicado antes da migração). A área some, em vez de mostrar botões
  // que dariam erro.
  if (fotos.isError && vistoria.isError) return null

  const lista = fotos.data ?? []
  const cancelada = status === 'cancelada'
  const cabeMais = !cancelada && lista.length < FOTOS_POR_ORDEM
  const vistoriaEditavel = status !== 'entregue' && status !== 'cancelada'

  // O uso do plano só aparece quando importa: a partir de 80%.
  const limite = uso.data?.limite ?? null
  const perto = limite != null && limite > 0 && (uso.data?.emUso ?? 0) >= limite * 0.8

  return (
    <>
      <TituloSecao>
        Fotos{' '}
        <span className="text-corpo font-normal text-em-fundo-2">
          ({lista.length} de {FOTOS_POR_ORDEM})
        </span>
      </TituloSecao>
      <Card>
        {lista.length > 0 && (
          <ul className="grid grid-cols-3 gap-2 pb-4 tablet:grid-cols-5">
            {lista.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setVendo(f)}
                  className="relative block aspect-square w-full overflow-hidden rounded-controle bg-borda-em-superficie"
                  aria-label={`Foto de ${ROTULO_DO_MOMENTO[f.momento].toLowerCase()}`}
                >
                  {f.endereco && (
                    <img
                      src={f.endereco}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  )}
                  <span className="absolute bottom-1 left-1 rounded-badge bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
                    {ROTULO_DO_MOMENTO[f.momento]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {lista.length === 0 && !fotos.isPending && (
          <p className="pb-4 text-corpo text-em-superficie-2">
            Registre como a moto chegou, o defeito encontrado e a peça trocada. A
            foto guarda a data e quem tirou.
          </p>
        )}

        {cabeMais ? (
          <>
            <div className="flex gap-2 pb-3" role="radiogroup" aria-label="Momento da foto">
              {(Object.keys(ROTULO_DO_MOMENTO) as MomentoDaFoto[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={momento === m}
                  onClick={() => setMomento(m)}
                  className={cn(
                    'min-h-toque flex-1 rounded-controle border px-2 text-apoio font-medium',
                    momento === m
                      ? 'border-transparent bg-acento text-em-superficie'
                      : 'border-borda-em-superficie text-em-superficie',
                  )}
                >
                  {ROTULO_DO_MOMENTO[m]}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Botao
                variante="contorno-no-card"
                icone={<Camera aria-hidden size={20} />}
                carregando={enviar.isPending}
                onClick={() => camera.current?.click()}
              >
                Tirar foto
              </Botao>
              <Botao
                variante="contorno-no-card"
                icone={<ImagePlus aria-hidden size={20} />}
                disabled={enviar.isPending}
                onClick={() => galeria.current?.click()}
              >
                Da galeria
              </Botao>
            </div>
            {/* `capture` abre a câmera direto no celular; sem ele, a galeria. */}
            <input
              ref={camera}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={aoEscolher}
            />
            <input ref={galeria} type="file" accept="image/*" className="hidden" onChange={aoEscolher} />
          </>
        ) : (
          !cancelada && (
            <p className="text-apoio text-em-superficie-2">
              Esta ordem já tem {FOTOS_POR_ORDEM} fotos.
              {p.ehAdmin ? ' Apague uma para colocar outra.' : ''}
            </p>
          )
        )}

        {perto && !noLimiteDoPlano && (
          <p className="pt-3 text-apoio text-atencao-forte">
            A oficina já guarda {uso.data!.emUso} de {limite} fotos do plano.
          </p>
        )}
        <p className="pt-3 text-apoio text-em-superficie-2">
          As fotos ficam guardadas enquanto durar a garantia, e no mínimo 30 dias
          depois da entrega.
        </p>
      </Card>

      <TituloSecao
        acao={
          vistoria.data && vistoriaEditavel ? (
            <Botao variante="texto" onClick={() => setFazendoVistoria(true)}>
              Editar
            </Botao>
          ) : undefined
        }
      >
        Vistoria de entrada
      </TituloSecao>
      {vistoria.data ? (
        <ResumoDaVistoria vistoria={vistoria.data} />
      ) : (
        <Card>
          <p className="text-corpo text-em-superficie-2">
            {vistoriaEditavel
              ? 'Opcional. Marque como a moto chegou e o que o cliente deixou — registra o que a foto não mostra direito.'
              : 'Não foi feita.'}
          </p>
          {vistoriaEditavel && (
            <Botao
              largo
              variante="contorno-no-card"
              className="mt-4"
              icone={<ClipboardCheck aria-hidden size={20} />}
              onClick={() => setFazendoVistoria(true)}
            >
              Fazer vistoria
            </Botao>
          )}
        </Card>
      )}

      {/* Foto grande ------------------------------------------------------- */}
      <Modal
        aberto={vendo !== null}
        aoFechar={() => setVendo(null)}
        titulo={vendo ? `Foto de ${ROTULO_DO_MOMENTO[vendo.momento].toLowerCase()}` : ''}
        larga
        rodape={
          p.ehAdmin && vendo ? (
            <Botao
              largo
              variante="perigo"
              icone={<Trash2 aria-hidden size={20} />}
              carregando={apagar.isPending}
              onClick={() => {
                if (window.confirm('Apagar esta foto? Não dá para desfazer.')) apagar.mutate(vendo)
              }}
            >
              Apagar foto
            </Botao>
          ) : undefined
        }
      >
        {vendo?.endereco && (
          <img
            src={vendo.endereco}
            alt=""
            className="max-h-[70dvh] w-full rounded-controle object-contain"
          />
        )}
        {vendo && (
          <p className="pt-3 text-apoio text-em-superficie-2">Tirada em {dataHora(vendo.criado_em)}</p>
        )}
      </Modal>

      {/* Limite do plano ---------------------------------------------------- */}
      <Modal
        aberto={noLimiteDoPlano}
        aoFechar={() => setNoLimiteDoPlano(false)}
        titulo="A oficina chegou no limite de fotos"
        rodape={
          p.ehAdmin ? (
            <Botao largo onClick={() => navegar('/configuracoes')}>
              Ver planos
            </Botao>
          ) : undefined
        }
      >
        <p className="text-corpo text-em-superficie">
          O plano atual guarda até {limite ?? 'o limite de'} fotos ao mesmo tempo, e todas
          estão em uso.
        </p>
        <p className="pt-3 text-corpo text-em-superficie-2">
          {p.ehAdmin
            ? 'Num plano maior cabem muito mais. As fotos antigas também saem sozinhas quando a garantia de cada serviço termina.'
            : 'Avise o responsável pela oficina: ele pode passar para um plano maior.'}
        </p>
      </Modal>

      {/* A pergunta ao iniciar --------------------------------------------- */}
      <Modal
        aberto={perguntando}
        aoFechar={() => setPerguntando(false)}
        titulo="Quer registrar como a moto chegou?"
        rodape={
          <div className="flex flex-col gap-2">
            <Botao
              largo
              icone={<ClipboardCheck aria-hidden size={20} />}
              onClick={() => {
                setPerguntando(false)
                setFazendoVistoria(true)
              }}
            >
              Fazer a vistoria
            </Botao>
            <Botao largo variante="contorno-no-card" onClick={() => setPerguntando(false)}>
              Agora não
            </Botao>
          </div>
        }
      >
        <p className="text-corpo text-em-superficie-2">
          A vistoria e as fotos de entrada protegem a oficina se o cliente reclamar
          depois de um risco ou de uma peça. É opcional e leva um minuto.
        </p>
      </Modal>

      <FormularioDaVistoria
        aberto={fazendoVistoria}
        aoFechar={() => setFazendoVistoria(false)}
        ordemId={ordemId}
        atual={vistoria.data ?? null}
      />
    </>
  )
}

function ResumoDaVistoria({ vistoria }: { vistoria: OsVistoria }) {
  const avarias = ITENS_DA_VISTORIA.filter((i) => vistoria.itens[i.chave] === 'avaria')
  const conferidos = ITENS_DA_VISTORIA.filter((i) => vistoria.itens[i.chave] === 'ok')
  const combustivel = NIVEIS_DE_COMBUSTIVEL.find((n) => n.valor === vistoria.combustivel)

  return (
    <Card>
      {avarias.length > 0 && (
        <div className="flex items-start gap-2 rounded-controle bg-atencao-fundo px-3 py-2">
          <TriangleAlert aria-hidden size={18} className="mt-0.5 shrink-0 text-atencao-forte" />
          <p className="text-corpo text-atencao-forte">
            Chegou com avaria: {avarias.map((a) => a.rotulo.toLowerCase()).join('; ')}.
          </p>
        </div>
      )}
      <dl className="flex flex-col gap-2 pt-3">
        {conferidos.length > 0 && (
          <div>
            <dt className="text-apoio text-em-superficie-2">Conferido sem avaria</dt>
            <dd className="text-corpo text-em-superficie">
              {conferidos.map((c) => c.rotulo).join(', ')}
            </dd>
          </div>
        )}
        {combustivel && (
          <div>
            <dt className="text-apoio text-em-superficie-2">Combustível</dt>
            <dd className="text-corpo text-em-superficie">{combustivel.rotulo}</dd>
          </div>
        )}
        {vistoria.pertences && (
          <div>
            <dt className="text-apoio text-em-superficie-2">O cliente deixou</dt>
            <dd className="text-corpo text-em-superficie">{vistoria.pertences}</dd>
          </div>
        )}
        {vistoria.observacoes && (
          <div>
            <dt className="text-apoio text-em-superficie-2">Observações</dt>
            <dd className="whitespace-pre-line text-corpo text-em-superficie">{vistoria.observacoes}</dd>
          </div>
        )}
        <p className="pt-1 text-apoio text-em-superficie-2">Feita em {dataHora(vistoria.feita_em)}</p>
      </dl>
    </Card>
  )
}

function FormularioDaVistoria({
  aberto,
  aoFechar,
  ordemId,
  atual,
}: {
  aberto: boolean
  aoFechar: () => void
  ordemId: string
  atual: OsVistoria | null
}) {
  const toast = useToast()
  const cache = useQueryClient()
  const [itens, setItens] = useState<Record<string, 'ok' | 'avaria'>>({})
  const [combustivel, setCombustivel] = useState<Combustivel | null>(null)
  const [pertences, setPertences] = useState('')
  const [observacoes, setObservacoes] = useState('')

  // Abre com o que já foi salvo, para editar sem redigitar.
  useEffect(() => {
    if (!aberto) return
    setItens(atual?.itens ?? {})
    setCombustivel(atual?.combustivel ?? null)
    setPertences(atual?.pertences ?? '')
    setObservacoes(atual?.observacoes ?? '')
  }, [aberto, atual])

  const salvar = useMutation({
    mutationFn: () =>
      salvarVistoria({
        ordemId,
        itens,
        combustivel,
        pertences: pertences.trim() || null,
        observacoes: observacoes.trim() || null,
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['vistoria', ordemId] })
      toast.sucesso('Vistoria guardada.')
      aoFechar()
    },
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  function marcar(chave: string, valor: 'ok' | 'avaria') {
    setItens((antes) => {
      const novo = { ...antes }
      // Tocar de novo no que já está marcado desmarca: "não conferi" é
      // diferente de "conferi e está ok".
      if (novo[chave] === valor) delete novo[chave]
      else novo[chave] = valor
      return novo
    })
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Vistoria de entrada"
      rodape={
        <Botao largo carregando={salvar.isPending} onClick={() => salvar.mutate()}>
          Guardar vistoria
        </Botao>
      }
    >
      <p className="pb-4 text-apoio text-em-superficie-2">
        Marque só o que conferiu. Para registrar uma avaria, tire também uma foto de
        entrada.
      </p>
      <ul className="flex flex-col divide-y divide-borda-em-superficie">
        {ITENS_DA_VISTORIA.map((i) => (
          <li key={i.chave} className="flex items-center justify-between gap-3 py-2">
            <span className="text-corpo text-em-superficie">{i.rotulo}</span>
            <span className="flex shrink-0 gap-1.5">
              {(['ok', 'avaria'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={itens[i.chave] === v}
                  onClick={() => marcar(i.chave, v)}
                  className={cn(
                    'min-h-toque rounded-controle border px-3 text-apoio font-medium',
                    itens[i.chave] === v
                      ? v === 'ok'
                        ? 'border-transparent bg-sucesso-fundo text-sucesso-forte'
                        : 'border-transparent bg-atencao-fundo text-atencao-forte'
                      : 'border-borda-em-superficie text-em-superficie-2',
                  )}
                >
                  {v === 'ok' ? 'OK' : 'Avaria'}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>

      <p className="pb-2 pt-5 text-apoio font-medium text-em-superficie">Combustível</p>
      <div className="grid grid-cols-5 gap-1.5">
        {NIVEIS_DE_COMBUSTIVEL.map((n) => (
          <button
            key={n.valor}
            type="button"
            aria-pressed={combustivel === n.valor}
            onClick={() => setCombustivel(combustivel === n.valor ? null : n.valor)}
            className={cn(
              'min-h-toque rounded-controle border text-apoio font-medium',
              combustivel === n.valor
                ? 'border-transparent bg-acento text-em-superficie'
                : 'border-borda-em-superficie text-em-superficie',
            )}
          >
            {n.rotulo}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4 pt-5">
        <Campo
          rotulo="O que o cliente deixou com a moto"
          placeholder="Capacete, documento, chave reserva…"
          value={pertences}
          onChange={(e) => setPertences(e.target.value)}
        />
        <AreaTexto
          rotulo="Observações"
          placeholder="Arranhão no tanque do lado esquerdo, já veio assim."
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
        />
      </div>
    </Modal>
  )
}
