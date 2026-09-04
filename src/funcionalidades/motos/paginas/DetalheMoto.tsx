import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { resolverZod } from '@/lib/formulario'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Gauge, ClipboardList, User, History } from 'lucide-react'
import { Tela, CabecalhoInterno, TituloSecao } from '@/componentes/layout/Tela'
import { Card, ListaCard, LinhaLista, IconeCirculo } from '@/componentes/ui/Card'
import { Botao } from '@/componentes/ui/Botao'
import { Badge } from '@/componentes/ui/Badge'
import { Campo } from '@/componentes/ui/Campo'
import { Modal } from '@/componentes/ui/Modal'
import { Carregando, EsqueletoLista } from '@/componentes/ui/Carregando'
import { EstadoErro } from '@/componentes/ui/EstadoVazio'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { exibirPlaca, quilometragem, data, moeda } from '@/lib/formato'
import { usePermissoes } from '@/auth/usePermissoes'
import {
  esquemaKm,
  type DadosFormularioKm,
  type DadosKmValidados,
} from '../esquemas'
import { useAuth } from '@/auth/ProvedorAuth'
import { historicoDaPlaca } from '@/funcionalidades/painel/api'
import { obterMoto, proprietariosDaMoto, atualizarKm } from '../api'

/**
 * O gerador do PDF pesa e só serve a quem pede o histórico em papel — na venda
 * da moto, quase sempre. Chega sob demanda, como nos outros documentos.
 */
let moduloPdf: typeof import('@/funcionalidades/painel/pdfHistorico') | null = null
const carregarPdf = () =>
  import('@/funcionalidades/painel/pdfHistorico').then((m) => (moduloPdf = m))

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-rotulo text-claro-secundario">{rotulo}</span>
      <span className="text-corpo text-claro">{valor}</span>
    </div>
  )
}

export function DetalheMoto() {
  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()
  const toast = useToast()
  const cache = useQueryClient()
  const p = usePermissoes()
  const { oficina } = useAuth()
  const [editandoKm, setEditandoKm] = useState(false)
  const [pdfPronto, setPdfPronto] = useState(moduloPdf !== null)

  useEffect(() => {
    if (moduloPdf) return
    let vivo = true
    void carregarPdf().then(() => vivo && setPdfPronto(true))
    return () => {
      vivo = false
    }
  }, [])

  const { data: moto, isPending, isError, refetch } = useQuery({
    queryKey: ['moto', id],
    queryFn: () => obterMoto(id!),
  })

  const historico = useQuery({
    queryKey: ['historico-da-placa', id],
    queryFn: () => historicoDaPlaca(id!),
    enabled: Boolean(moto),
  })

  const { data: proprietarios } = useQuery({
    queryKey: ['moto', id, 'proprietarios'],
    queryFn: () => proprietariosDaMoto(id!),
    enabled: Boolean(moto),
  })

  const formularioKm = useForm<DadosFormularioKm, unknown, DadosKmValidados>({
    resolver: resolverZod<DadosFormularioKm, DadosKmValidados>(esquemaKm),
    defaultValues: { km_atual: '' },
  })

  function baixarHistorico() {
    if (!moto || !oficina || !moduloPdf) return
    try {
      const doc = moduloPdf.gerarPdfDoHistorico(moto, historico.data ?? [], oficina)
      doc.save(moduloPdf.nomeDoArquivoDoHistorico(moto.placa))
    } catch (e) {
      toast.erro(traduzirErro(e))
    }
  }

  const salvarKm = useMutation({
    mutationFn: (dados: DadosKmValidados) => atualizarKm(id!, dados.km_atual),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['moto', id] })
      void cache.invalidateQueries({ queryKey: ['motos'] })
      setEditandoKm(false)
      formularioKm.reset({ km_atual: '' })
      toast.sucesso('Quilometragem atualizada.')
    },
    onError: (erro) => toast.erro(traduzirErro(erro)),
  })

  if (isPending) return <Carregando />
  if (isError) return <EstadoErro aoTentarDeNovo={() => void refetch()} />
  if (!moto) {
    return (
      <EstadoErro
        titulo="Moto não encontrada"
        descricao="Ela pode ter sido removida. Volte para a lista de motos."
        aoTentarDeNovo={() => navegar('/motos', { replace: true })}
      />
    )
  }

  const donoAtual = proprietarios?.find((prop) => prop.data_fim === null)
  const anteriores = proprietarios?.filter((prop) => prop.data_fim !== null) ?? []

  return (
    <Tela>
      <CabecalhoInterno
        titulo={exibirPlaca(moto.placa)}
        contexto={[moto.marca, moto.modelo, moto.ano].filter(Boolean).join(' · ')}
        acao={
          p.editarMotos ? (
            <Botao
              variante="contorno"
              className="h-toque px-4"
              icone={<Pencil aria-hidden size={18} />}
              onClick={() => navegar(`/motos/${moto.id}/editar`)}
            >
              Editar
            </Botao>
          ) : undefined
        }
      />

      {/* Quilometragem é o dado que mais muda e o que o mecânico mais pergunta:
          fica em destaque, com atualização em um toque. */}
      <Card>
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-rotulo text-claro-secundario">Quilometragem</span>
            <span className="text-destaque text-claro">
              {new Intl.NumberFormat('pt-BR').format(moto.km_atual)}
            </span>
            <span className="text-apoio text-claro-secundario">
              Atualizada em {data(moto.atualizado_em)}
            </span>
          </div>
          {p.editarMotos && (
            <Botao
              variante="contorno-no-card"
              className="h-toque px-4"
              icone={<Gauge aria-hidden size={18} />}
              onClick={() => {
                formularioKm.reset({ km_atual: String(moto.km_atual) })
                setEditandoKm(true)
              }}
            >
              Atualizar
            </Botao>
          )}
        </div>
      </Card>

      <TituloSecao>Dados da moto</TituloSecao>
      <Card>
        <Linha rotulo="Placa" valor={exibirPlaca(moto.placa)} />
        <Linha rotulo="Marca" valor={moto.marca ?? '—'} />
        <Linha rotulo="Modelo" valor={moto.modelo ?? '—'} />
        <Linha rotulo="Ano" valor={moto.ano ? String(moto.ano) : '—'} />
        <Linha rotulo="Cor" valor={moto.cor ?? '—'} />
        <Linha rotulo="Chassi" valor={moto.chassi ?? '—'} />
      </Card>

      {/* O histórico pertence à placa, não ao dono. Quem chega aqui vê tudo o
          que já foi feito na moto, mesmo o que aconteceu com o dono anterior —
          mas do dono anterior sai só o nome. Telefone, e-mail e CPF dele não são
          assunto de quem comprou a moto (migration 0036). */}
      <TituloSecao
        acao={
          (historico.data ?? []).length > 0 ? (
            <Botao variante="texto" carregando={!pdfPronto} onClick={baixarHistorico}>
              PDF
            </Botao>
          ) : undefined
        }
      >
        Histórico da placa
      </TituloSecao>

      {historico.isPending ? (
        <EsqueletoLista linhas={2} />
      ) : (historico.data ?? []).length === 0 ? (
        <Card escuro>
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-acento">
              <ClipboardList aria-hidden size={20} className="text-claro" />
            </span>
            <div>
              <p className="text-corpo text-escuro">Nenhum serviço concluído ainda</p>
              <p className="pt-1 text-apoio text-escuro-secundario">
                Todo serviço concluído nesta placa vai aparecer aqui, com a data e
                quem era o dono na época — mesmo que a moto troque de mãos.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {(historico.data ?? []).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => navegar(`/ordens/${s.id}`)}
              className="rounded-card bg-superficie p-4 text-left shadow-card active:opacity-90"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-corpo font-medium text-claro">
                    OS {String(s.numero).padStart(3, '0')} · {data(s.data)}
                  </p>
                  <p className="text-apoio text-claro-secundario">
                    {s.km ? `${quilometragem(s.km)} · ` : ''}
                    dono na época: {s.dono_na_epoca ?? '—'}
                  </p>
                </div>
                <span className="shrink-0 text-corpo font-semibold text-claro">
                  {moeda(s.valor)}
                </span>
              </div>

              {(s.servicos.length > 0 || s.pecas.length > 0) && (
                <p className="border-t border-borda-clara pt-3 mt-3 text-apoio text-claro-secundario">
                  {[...s.servicos, ...s.pecas].join(' · ')}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      <TituloSecao>Proprietários</TituloSecao>
      <ListaCard>
        {donoAtual && (
          <LinhaLista
            inicio={
              <IconeCirculo>
                <User aria-hidden size={20} />
              </IconeCirculo>
            }
            titulo={donoAtual.cliente?.nome ?? 'Cliente removido'}
            // Só a data: ao lado do badge sobra pouca largura, e o telefone
            // cortado pela metade não serve para ninguém. Ele aparece inteiro
            // na tela do cliente, que é para onde esta linha leva.
            descricao={`Desde ${data(donoAtual.data_inicio)}`}
            fim={<Badge tom="sucesso">Dono atual</Badge>}
            aoTocar={
              donoAtual.cliente && p.verClientes
                ? () => navegar(`/clientes/${donoAtual.cliente!.id}`)
                : undefined
            }
          />
        )}

        {anteriores.map((prop) => (
          <LinhaLista
            key={prop.id}
            inicio={
              <IconeCirculo>
                <History aria-hidden size={20} />
              </IconeCirculo>
            }
            titulo={prop.cliente?.nome ?? 'Cliente removido'}
            descricao={`De ${data(prop.data_inicio)} a ${data(prop.data_fim)}`}
            fim={<Badge>Anterior</Badge>}
            aoTocar={
              prop.cliente && p.verClientes
                ? () => navegar(`/clientes/${prop.cliente!.id}`)
                : undefined
            }
          />
        ))}

        {!donoAtual && anteriores.length === 0 && (
          <LinhaLista titulo="Sem proprietário registrado" comSeta={false} />
        )}
      </ListaCard>

      <Modal
        aberto={editandoKm}
        aoFechar={() => setEditandoKm(false)}
        titulo="Atualizar quilometragem"
        rodape={
          <Botao
            largo
            carregando={salvarKm.isPending}
            onClick={formularioKm.handleSubmit((d) => salvarKm.mutate(d))}
          >
            Salvar
          </Botao>
        }
      >
        <form onSubmit={formularioKm.handleSubmit((d) => salvarKm.mutate(d))} noValidate>
          <Campo
            rotulo="Quilometragem atual"
            inputMode="numeric"
            autoFocus
            dica={`Anterior: ${quilometragem(moto.km_atual)}`}
            erro={formularioKm.formState.errors.km_atual?.message}
            {...formularioKm.register('km_atual')}
          />
        </form>
      </Modal>
    </Tela>
  )
}
