/**
 * Os parceiros que mandam cliente para a oficina, e o acerto com eles.
 *
 * Duas abas, porque são duas perguntas diferentes: "quem indica para mim?" e
 * "quanto eu devo agora?". A segunda é a que o dono abre no dia de pagar.
 *
 * A comissão nasce quando o orçamento é aprovado (0065). É uma escolha com
 * risco conhecido — serviço que não acontece teria gerado dívida —, e o
 * contrapeso está no banco: cancelar a ordem cancela a comissão.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Handshake, Plus, Check, Undo2, Percent } from 'lucide-react'
import { Tela, CabecalhoTela, TituloSecao } from '@/componentes/layout/Tela'
import { Abas } from '@/componentes/ui/Abas'
import { Card, ListaCard, LinhaLista, IconeCirculo } from '@/componentes/ui/Card'
import { Badge } from '@/componentes/ui/Badge'
import { Botao } from '@/componentes/ui/Botao'
import { EstadoVazio, EstadoErro } from '@/componentes/ui/EstadoVazio'
import { EsqueletoLista } from '@/componentes/ui/Carregando'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { moeda, data, telefone, porcentagem } from '@/lib/formato'
import {
  indicadoresComComissoes,
  listarComissoes,
  pagarComissao,
  desfazerPagamento,
  type IndicadorNoResumo,
} from '../api'

const abas = [
  { id: 'indicadores', rotulo: 'Indicadores' },
  { id: 'a_pagar', rotulo: 'A pagar' },
  { id: 'paga', rotulo: 'Pagas' },
] as const

type Aba = (typeof abas)[number]['id']

export function Indicadores() {
  const navegar = useNavigate()
  const [aba, setAba] = useState<Aba>('indicadores')

  return (
    <Tela>
      <CabecalhoTela
        titulo="Indicadores"
        contexto="Quem manda cliente para a oficina, e o acerto com cada um"
      />

      <Abas rotulo="O que ver" abas={abas} ativa={aba} aoTrocar={setAba} />

      <div className="pt-4">
        {aba === 'indicadores' ? (
          <ListaDeIndicadores aoNovo={() => navegar('/indicadores/novo')} />
        ) : (
          <ListaDeComissoes status={aba} />
        )}
      </div>
    </Tela>
  )
}

function ListaDeIndicadores({ aoNovo }: { aoNovo: () => void }) {
  const navegar = useNavigate()
  const { data: resumo, isPending, isError, refetch } = useQuery({
    queryKey: ['indicadores'],
    queryFn: indicadoresComComissoes,
  })

  if (isPending) return <EsqueletoLista linhas={3} />
  if (isError) return <EstadoErro aoTentarDeNovo={() => void refetch()} />

  const lista = resumo?.indicadores ?? []

  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <IconeCirculo>
              <Percent aria-hidden size={20} />
            </IconeCirculo>
            <div>
              <p className="text-corpo text-em-superficie">
                Comissão padrão: {porcentagem(resumo!.percentual_padrao)}
              </p>
              <p className="text-apoio text-em-superficie-2">
                Vale para quem não tem percentual próprio. Muda em Configurações.
              </p>
            </div>
          </div>
        </div>
      </Card>

      <div className="pt-4">
        <Botao largo icone={<Plus aria-hidden size={20} />} onClick={aoNovo}>
          Cadastrar indicador
        </Botao>
      </div>

      {lista.length === 0 ? (
        <div className="pt-4">
          <EstadoVazio
            icone={<Handshake aria-hidden size={28} />}
            titulo="Nenhum indicador ainda"
            descricao="Cadastre quem manda cliente para a oficina. Cada um escolhe o próprio código, e o cliente fala esse código no balcão."
          />
        </div>
      ) : (
        <>
          <TituloSecao>Cadastrados ({lista.length})</TituloSecao>
          <div className="flex flex-col gap-3">
            {lista.map((i) => (
              <CartaoDoIndicador
                key={i.id}
                indicador={i}
                aoAbrir={() => navegar(`/indicadores/${i.id}`)}
              />
            ))}
          </div>
        </>
      )}
    </>
  )
}

function CartaoDoIndicador({
  indicador,
  aoAbrir,
}: {
  indicador: IndicadorNoResumo
  aoAbrir: () => void
}) {
  return (
    <button type="button" onClick={aoAbrir} className="text-left">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-secao text-em-superficie">{indicador.nome}</p>
            <p className="text-corpo text-em-superficie-2">
              Código <strong className="text-em-superficie">{indicador.codigo}</strong> ·{' '}
              {porcentagem(indicador.percentual_efetivo)}
              {indicador.percentual === null ? ' (padrão)' : ''}
            </p>
            {indicador.telefone && (
              <p className="text-apoio text-em-superficie-2">{telefone(indicador.telefone)}</p>
            )}
          </div>
          {!indicador.ativo && <Badge>Inativo</Badge>}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3 border-t border-borda-em-superficie pt-3">
          <div>
            <p className="text-rotulo text-em-superficie-2">Indicações</p>
            <p className="text-corpo font-medium text-em-superficie">{indicador.indicacoes}</p>
          </div>
          <div>
            <p className="text-rotulo text-em-superficie-2">A pagar</p>
            <p
              className={`text-corpo font-medium ${
                Number(indicador.a_pagar) > 0 ? 'text-atencao-forte' : 'text-em-superficie'
              }`}
            >
              {moeda(indicador.a_pagar)}
            </p>
          </div>
          <div>
            <p className="text-rotulo text-em-superficie-2">Já pago</p>
            <p className="text-corpo font-medium text-em-superficie">{moeda(indicador.pago)}</p>
          </div>
        </div>
      </Card>
    </button>
  )
}

function ListaDeComissoes({ status }: { status: 'a_pagar' | 'paga' }) {
  const cache = useQueryClient()
  const toast = useToast()
  const { data: comissoes, isPending, isError, refetch } = useQuery({
    queryKey: ['comissoes', status],
    queryFn: () => listarComissoes(status),
  })

  const mexer = useMutation({
    mutationFn: (id: string) => (status === 'a_pagar' ? pagarComissao(id) : desfazerPagamento(id)),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['comissoes'] })
      void cache.invalidateQueries({ queryKey: ['indicadores'] })
      toast.sucesso(status === 'a_pagar' ? 'Comissão marcada como paga.' : 'Pagamento desfeito.')
    },
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  if (isPending) return <EsqueletoLista linhas={3} />
  if (isError) return <EstadoErro aoTentarDeNovo={() => void refetch()} />

  const lista = comissoes ?? []
  const total = lista.reduce((soma, c) => soma + Number(c.valor), 0)

  if (lista.length === 0) {
    return (
      <EstadoVazio
        icone={<Handshake aria-hidden size={28} />}
        titulo={status === 'a_pagar' ? 'Nada a pagar' : 'Nenhuma comissão paga ainda'}
        descricao={
          status === 'a_pagar'
            ? 'Quando um orçamento com indicador for aprovado, a comissão aparece aqui.'
            : 'As comissões que você marcar como pagas ficam guardadas aqui.'
        }
      />
    )
  }

  return (
    <>
      <Card>
        <p className="text-rotulo text-em-superficie-2">
          {status === 'a_pagar' ? 'Total a pagar' : 'Total já pago'}
        </p>
        <p className="text-destaque text-em-superficie">{moeda(total)}</p>
        <p className="text-apoio text-em-superficie-2">
          {lista.length} {lista.length === 1 ? 'comissão' : 'comissões'}
        </p>
      </Card>

      <div className="pt-4">
        <ListaCard>
          {lista.map((c) => (
            <LinhaLista
              key={c.id}
              comSeta={false}
              inicio={
                <IconeCirculo>
                  <Handshake aria-hidden size={20} />
                </IconeCirculo>
              }
              titulo={`${c.indicador?.nome ?? 'Indicador removido'} · ${moeda(c.valor)}`}
              descricao={[
                c.orcamento ? `Orçamento ${String(c.orcamento.numero).padStart(3, '0')}` : null,
                c.ordem ? `OS ${String(c.ordem.numero).padStart(3, '0')}` : null,
                `${porcentagem(c.percentual)} de ${moeda(c.base)}`,
                c.data_pagamento ? `pago em ${data(c.data_pagamento)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              fim={
                <Botao
                  variante="contorno-no-card"
                  className="h-toque px-3"
                  carregando={mexer.isPending && mexer.variables === c.id}
                  icone={
                    status === 'a_pagar' ? (
                      <Check aria-hidden size={18} />
                    ) : (
                      <Undo2 aria-hidden size={18} />
                    )
                  }
                  onClick={() => mexer.mutate(c.id)}
                >
                  {status === 'a_pagar' ? 'Paguei' : 'Desfazer'}
                </Botao>
              }
            />
          ))}
        </ListaCard>
      </div>
    </>
  )
}
