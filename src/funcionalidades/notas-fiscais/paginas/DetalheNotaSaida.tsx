import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, User } from 'lucide-react'
import { Tela, CabecalhoInterno, TituloSecao } from '@/componentes/layout/Tela'
import { Detalhe } from '@/componentes/layout/Detalhe'
import { Card, LinhaLista } from '@/componentes/ui/Card'
import { Botao } from '@/componentes/ui/Botao'
import { Modal } from '@/componentes/ui/Modal'
import { Carregando } from '@/componentes/ui/Carregando'
import { EstadoErro } from '@/componentes/ui/EstadoVazio'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { moeda, data, telefone } from '@/lib/formato'
import { rotuloDaForma, statusDaConta } from '@/funcionalidades/financeiro/api'
import { StatusNotaBadge } from '../StatusNotaBadge'
import { obterNotaSaida, cancelarNotaSaida } from '../api'

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-rotulo text-em-superficie-2">{rotulo}</span>
      <span className="text-corpo text-em-superficie">{valor}</span>
    </div>
  )
}

export function DetalheNotaSaida() {
  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()
  const toast = useToast()
  const cache = useQueryClient()
  const [cancelando, setCancelando] = useState(false)

  const { data: nota, isPending, isError, refetch } = useQuery({
    queryKey: ['nota-saida', id],
    queryFn: () => obterNotaSaida(id!),
  })

  const cancelar = useMutation({
    mutationFn: () => cancelarNotaSaida(id!),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['nota-saida', id] })
      void cache.invalidateQueries({ queryKey: ['notas-saida'] })
      void cache.invalidateQueries({ queryKey: ['produtos'] })
      void cache.invalidateQueries({ queryKey: ['contas-receber'] })
      setCancelando(false)
      toast.sucesso('Venda cancelada.')
    },
    onError: (e) => {
      setCancelando(false)
      toast.erro(traduzirErro(e))
    },
  })

  if (isPending) return <Carregando />
  if (isError) return <EstadoErro aoTentarDeNovo={() => void refetch()} />
  if (!nota) {
    return (
      <EstadoErro
        titulo="Nota não encontrada"
        descricao="Ela pode ter sido removida. Volte para a lista."
        aoTentarDeNovo={() => navegar('/notas-fiscais?tipo=saida', { replace: true })}
      />
    )
  }

  const temFiscal = nota.cfop || nota.natureza_operacao || nota.valor_icms || nota.valor_iss
  const veioDeOs = Boolean(nota.ordem_servico_id)

  return (
    <Tela>
      <CabecalhoInterno
        titulo={nota.numero ? `Nota ${nota.numero}` : 'Venda sem número'}
        contexto={`Registrada em ${data(nota.criado_em)}`}
        acao={<StatusNotaBadge status={nota.status} />}
      />

      <Detalhe
        apoio={
          <Card>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-acento-suave">
                <User aria-hidden size={20} className="text-em-superficie" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-corpo font-medium text-em-superficie">
                  {nota.cliente?.nome ?? 'Sem cliente identificado'}
                </p>
                <p className="text-apoio text-em-superficie-2">
                  {nota.cliente?.telefone ? telefone(nota.cliente.telefone) : moeda(nota.valor_total)}
                </p>
              </div>
            </div>
            {veioDeOs && (
              <p className="pt-3 text-apoio text-em-superficie-2">
                Formaliza uma ordem de serviço já concluída — o estoque baixou lá, não aqui.
              </p>
            )}
          </Card>
        }
      >
        <TituloSecao>Itens</TituloSecao>
        <div className="flex flex-col gap-3">
          {nota.itens.map((item) => (
            <div key={item.id} className="rounded-card bg-superficie p-4 shadow-card">
              <p className="text-corpo font-medium text-em-superficie">{item.descricao}</p>
              <p className="text-apoio text-em-superficie-2">{item.tipo === 'produto' ? 'Peça' : 'Serviço'}</p>
              <div className="flex items-baseline justify-between gap-4 pt-2">
                <span className="text-apoio text-em-superficie-2">
                  {item.quantidade} × {moeda(item.valor_unitario)}
                </span>
                <span className="text-corpo font-semibold text-em-superficie">
                  {moeda(item.quantidade * item.valor_unitario)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {nota.parcelas.length > 0 && (
          <>
            <TituloSecao>Contas a receber</TituloSecao>
            <div className="flex flex-col gap-2">
              {nota.parcelas.map((c) => {
                const efetivo = statusDaConta(c)
                return (
                  <LinhaLista
                    key={c.id}
                    titulo={c.descricao}
                    descricao={`Vence ${data(c.vencimento)}${c.forma_pagamento ? ` · ${rotuloDaForma(c.forma_pagamento)}` : ''}`}
                    fim={
                      <span className="text-corpo font-semibold text-em-superficie">
                        {moeda(c.valor)}
                        <span className="ml-2 text-apoio font-normal text-em-superficie-2">{efetivo}</span>
                      </span>
                    }
                    comSeta={false}
                  />
                )
              })}
            </div>
          </>
        )}

        {temFiscal && (
          <>
            <TituloSecao>Dados fiscais</TituloSecao>
            <Card>
              {nota.natureza_operacao && <Linha rotulo="Natureza da operação" valor={nota.natureza_operacao} />}
              {nota.cfop && <Linha rotulo="CFOP" valor={nota.cfop} />}
              {nota.valor_icms != null && <Linha rotulo="ICMS" valor={moeda(nota.valor_icms)} />}
              {nota.valor_iss != null && <Linha rotulo="ISS" valor={moeda(nota.valor_iss)} />}
            </Card>
          </>
        )}

        {nota.status === 'lancada' && (
          <div className="pt-6">
            <Botao
              largo
              variante="contorno"
              icone={<Ban aria-hidden size={20} />}
              onClick={() => setCancelando(true)}
            >
              Cancelar venda
            </Botao>
          </div>
        )}
      </Detalhe>

      <Modal
        aberto={cancelando}
        aoFechar={() => setCancelando(false)}
        titulo="Cancelar esta venda?"
        rodape={
          <Botao largo carregando={cancelar.isPending} onClick={() => cancelar.mutate()}>
            Cancelar a venda
          </Botao>
        }
      >
        <p className="text-corpo text-em-superficie-2">
          {veioDeOs
            ? 'Só o documento fiscal é cancelado — o serviço em si continua como está.'
            : 'As peças voltam para o estoque, e as parcelas que ainda estão em aberto são canceladas. O que já foi pago continua pago.'}
        </p>
      </Modal>
    </Tela>
  )
}
