import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { User, Bike, FileText, UserCog, TriangleAlert } from 'lucide-react'
import { Tela, CabecalhoInterno, TituloSecao } from '@/componentes/layout/Tela'
import { Detalhe } from '@/componentes/layout/Detalhe'
import { Card } from '@/componentes/ui/Card'
import { Botao } from '@/componentes/ui/Botao'
import { Modal } from '@/componentes/ui/Modal'
import { AreaTexto } from '@/componentes/ui/Campo'
import { Carregando } from '@/componentes/ui/Carregando'
import { EstadoErro } from '@/componentes/ui/EstadoVazio'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import {
  moeda,
  exibirPlaca,
  data,
  dataHora,
  quilometragem,
  telefone,
  porcentagem,
} from '@/lib/formato'
import { usePermissoes, nomeDoPerfil } from '@/auth/usePermissoes'
import { ItensDoOrcamento } from '@/funcionalidades/orcamentos/ItensDoOrcamento'
import type { ItemEmEdicao } from '@/funcionalidades/orcamentos/api'
import { StatusOsBadge, rotuloDoStatusOs } from '../StatusOsBadge'
import { ListaDeColaboradores } from '../EscolherResponsavel'
import { AcoesDaOrdem } from '../AcoesDaOrdem'
import { Cronometro } from '../Cronometro'
import {
  obterOrdemServico,
  tempoDaOs,
  sincronizarItensDaOs,
  atribuirResponsavel,
  salvarObservacoesTecnicas,
} from '../api'

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-rotulo text-claro-secundario">{rotulo}</span>
      <span className="text-corpo text-claro">{valor}</span>
    </div>
  )
}

/** Enquanto a ordem anda, os itens mudam. Depois de finalizada, é documento. */
const EDITAVEL = ['aberta', 'em_andamento', 'pausada', 'aguardando_conferencia']

export function DetalheOrdemServico() {
  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()
  const toast = useToast()
  const cache = useQueryClient()
  const p = usePermissoes()

  const { data: ordem, isPending, isError, refetch } = useQuery({
    queryKey: ['ordem-servico', id],
    queryFn: () => obterOrdemServico(id!),
  })

  // Consulta à parte: o relógio muda por conta própria, e recarregar a ordem
  // inteira a cada virada seria trazer os itens de novo à toa.
  const { data: tempo } = useQuery({
    queryKey: ['tempo-da-os', id],
    queryFn: () => tempoDaOs(id!),
  })

  // A tela edita uma cópia dos itens e manda a diferença para o banco. Sem a
  // cópia, cada toque no contador esperaria a ida e a volta do servidor.
  const [itens, setItens] = useState<ItemEmEdicao[]>([])
  const [trocandoResponsavel, setTrocandoResponsavel] = useState(false)
  const [tecnicas, setTecnicas] = useState('')
  const [tecnicasSujas, setTecnicasSujas] = useState(false)

  useEffect(() => {
    if (!ordem) return
    setItens(
      ordem.itens.map((i) => ({
        chave: i.id,
        tipo: i.tipo,
        produto_id: i.produto_id,
        servico_id: i.servico_id,
        descricao: i.descricao,
        quantidade: Number(i.quantidade),
        valor_unitario: Number(i.valor_unitario),
      })),
    )
    // Não sobrescreve o que a pessoa está digitando neste instante.
    setTecnicas((antes) => (tecnicasSujas ? antes : (ordem.observacoes_tecnicas ?? '')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordem])

  const sincronizar = useMutation({
    mutationFn: (novos: ItemEmEdicao[]) => sincronizarItensDaOs(id!, ordem?.itens ?? [], novos),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['ordem-servico', id] }),
    onError: (e) => {
      toast.erro(traduzirErro(e))
      void refetch()
    },
  })

  const trocarResponsavel = useMutation({
    mutationFn: (usuarioId: string) => atribuirResponsavel(id!, usuarioId),
    onSuccess: () => {
      setTrocandoResponsavel(false)
      void cache.invalidateQueries({ queryKey: ['ordem-servico', id] })
      void cache.invalidateQueries({ queryKey: ['ordens'] })
      toast.sucesso('Ordem passada para outro colaborador.')
    },
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  const salvarTecnicas = useMutation({
    mutationFn: () => salvarObservacoesTecnicas(id!, tecnicas),
    onSuccess: () => {
      setTecnicasSujas(false)
      void cache.invalidateQueries({ queryKey: ['ordem-servico', id] })
      toast.sucesso('Observação salva.')
    },
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  if (isPending) return <Carregando />
  if (isError) return <EstadoErro aoTentarDeNovo={() => void refetch()} />
  if (!ordem) {
    return (
      <EstadoErro
        titulo="Ordem de serviço não encontrada"
        descricao="Ela pode ter sido cancelada, ou não estar atribuída a você."
        aoTentarDeNovo={() => navegar('/', { replace: true })}
      />
    )
  }

  const soma = itens.reduce((a, i) => a + i.quantidade * i.valor_unitario, 0)
  const desconto = ordem.desconto_tipo === 'percentual'
    ? (soma * Number(ordem.desconto)) / 100
    : Number(ordem.desconto)
  const total = Math.max(soma - desconto, 0)

  const aprovado = ordem.orcamento ? Number(ordem.orcamento.valor_total) : null
  // Um centavo de diferença é arredondamento, não estouro de orçamento.
  const acima = aprovado != null && total - aprovado > 0.01 ? total - aprovado : null

  const podeEditarItens = p.gerenciarOrdens && EDITAVEL.includes(ordem.status)
  const mostraValores = p.gerenciarOrdens

  // A coluna de apoio: de quem é, o relógio, o que dá para fazer e quem está
  // com ela. São os quatro primeiros blocos da tela no celular, na ordem em que
  // já estavam — por isso o celular não muda ao virarem uma coluna à direita.
  const colunaDeApoio = (
    <>
        <Card>
          <div className="flex items-center gap-3 pb-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-acento-suave">
              <User aria-hidden size={20} className="text-claro" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-corpo font-medium text-claro">
                {ordem.cliente?.nome ?? 'Cliente removido'}
              </p>
              {ordem.cliente?.telefone && (
                <p className="text-apoio text-claro-secundario">
                  {telefone(ordem.cliente.telefone)}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 border-t border-borda-clara pt-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-acento-suave">
              <Bike aria-hidden size={20} className="text-claro" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-corpo font-medium text-claro">
                {ordem.moto ? exibirPlaca(ordem.moto.placa) : 'Moto removida'}
              </p>
              <p className="truncate text-apoio text-claro-secundario">
                {[ordem.moto?.marca, ordem.moto?.modelo].filter(Boolean).join(' ')}
                {ordem.km_entrada ? ` · ${quilometragem(ordem.km_entrada)}` : ''}
              </p>
            </div>
          </div>
        </Card>

        {tempo && (
          <div className="pt-6">
            <Cronometro tempo={tempo} />
          </div>
        )}

        <AcoesDaOrdem ordem={ordem} />

        <TituloSecao
          acao={
            p.gerenciarOrdens && EDITAVEL.includes(ordem.status) ? (
              <Botao variante="texto" onClick={() => setTrocandoResponsavel(true)}>
                Trocar
              </Botao>
            ) : undefined
          }
        >
          Responsável
        </TituloSecao>
        <Card>
          {ordem.responsavel ? (
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-acento-suave">
                <UserCog aria-hidden size={20} className="text-claro" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-corpo font-medium text-claro">
                  {ordem.responsavel.nome}
                </p>
                <p className="text-apoio text-claro-secundario">
                  {nomeDoPerfil[ordem.responsavel.perfil]}
                </p>
              </div>
            </div>
          ) : (
            <p className="py-2 text-corpo text-claro-secundario">Ninguém atribuído ainda.</p>
          )}
        </Card>
    </>
  )

  return (
    <Tela>
      <CabecalhoInterno
        titulo={`OS ${String(ordem.numero).padStart(3, '0')}`}
        contexto={`Aberta em ${data(ordem.data_abertura)}`}
        acao={<StatusOsBadge status={ordem.status} />}
      />

      <Detalhe apoio={colunaDeApoio}>

      {acima != null && mostraValores && (
        <div className="mt-6 flex items-start gap-3 rounded-card bg-atencao-fundo px-4 py-4">
          <TriangleAlert aria-hidden size={20} className="mt-0.5 shrink-0 text-atencao" />
          <p className="text-corpo text-atencao">
            Esta ordem está <strong>{moeda(acima)} acima</strong> do orçamento
            aprovado ({moeda(aprovado!)}). Confirme com o cliente antes de
            finalizar.
          </p>
        </div>
      )}

      <TituloSecao>{mostraValores ? 'Itens' : 'O que fazer'}</TituloSecao>
      <ItensDoOrcamento
        itens={itens}
        somenteLeitura={!podeEditarItens}
        semValores={!mostraValores}
        aoMudar={(novos) => {
          setItens(novos)
          sincronizar.mutate(novos)
        }}
      />

      {mostraValores && (
        <>
          <TituloSecao>Resumo</TituloSecao>
          <Card>
            <Linha rotulo="Soma dos itens" valor={moeda(soma)} />
            {desconto > 0 && (
              <Linha
                rotulo={
                  ordem.desconto_tipo === 'percentual'
                    ? `Desconto (${porcentagem(ordem.desconto)})`
                    : 'Desconto'
                }
                valor={`− ${moeda(desconto)}`}
              />
            )}
            <div className="flex items-baseline justify-between gap-4 border-t border-borda-clara py-3">
              <span className="text-secao text-claro">Total</span>
              <span className="text-destaque text-claro">{moeda(total)}</span>
            </div>
            <Linha
              rotulo="Garantia até"
              valor={ordem.garantia_ate ? data(ordem.garantia_ate) : '—'}
            />
            {ordem.data_conclusao && (
              <Linha rotulo="Concluída em" valor={data(ordem.data_conclusao)} />
            )}
          </Card>
        </>
      )}

      <TituloSecao>Observações do serviço</TituloSecao>
      <div className="flex flex-col gap-3 rounded-card bg-superficie p-5 shadow-card">
        <AreaTexto
          rotulo="O que foi feito, o que precisa de atenção"
          placeholder="Corrente estava folgada, ajustei. Pastilha traseira precisa trocar na próxima."
          dica="Isto é o que sai no comprovante da ordem."
          value={tecnicas}
          onChange={(e) => {
            setTecnicas(e.target.value)
            setTecnicasSujas(true)
          }}
          disabled={!EDITAVEL.includes(ordem.status)}
        />
        {tecnicasSujas && (
          <Botao
            largo
            variante="contorno-no-card"
            carregando={salvarTecnicas.isPending}
            onClick={() => salvarTecnicas.mutate()}
          >
            Salvar observação
          </Botao>
        )}
      </div>

      {ordem.observacoes && mostraValores && (
        <>
          <TituloSecao>Do orçamento aprovado</TituloSecao>
          <Card>
            <p className="whitespace-pre-line text-corpo text-claro">{ordem.observacoes}</p>
          </Card>
        </>
      )}

      <TituloSecao>Andamento</TituloSecao>
      <Card>
        {ordem.historico.map((passo) => (
          <div
            key={passo.id}
            className="flex items-baseline justify-between gap-4 border-b border-borda-clara py-2 last:border-b-0"
          >
            <span className="min-w-0 text-corpo text-claro">
              {passo.de ? rotuloDoStatusOs(passo.para) : 'Ordem aberta'}
              {passo.usuario && (
                <span className="block text-apoio text-claro-secundario">
                  {passo.usuario.nome}
                </span>
              )}
            </span>
            <span className="shrink-0 text-apoio text-claro-secundario">
              {dataHora(passo.criado_em)}
            </span>
          </div>
        ))}
      </Card>

      {ordem.orcamento_id && ordem.orcamento && (
        <Link
          to={`/orcamentos/${ordem.orcamento_id}`}
          className="mt-8 flex min-h-toque items-center justify-center gap-2 rounded-controle border border-borda-escura px-5 text-corpo font-semibold text-escuro"
        >
          <FileText aria-hidden size={20} />
          Ver o orçamento aprovado
        </Link>
      )}

      <Modal
        aberto={trocandoResponsavel}
        aoFechar={() => setTrocandoResponsavel(false)}
        titulo="Quem vai executar?"
      >
        <p className="pb-4 text-corpo text-claro-secundario">
          A ordem passa para a lista de quem você escolher. O tempo já apontado
          continua no nome de quem trabalhou.
        </p>
        <ListaDeColaboradores
          ativa={trocandoResponsavel}
          escolhidoId={ordem.responsavel_id}
          aoEscolher={(usuarioId) => trocarResponsavel.mutate(usuarioId)}
        />
      </Modal>
      </Detalhe>
    </Tela>
  )
}
