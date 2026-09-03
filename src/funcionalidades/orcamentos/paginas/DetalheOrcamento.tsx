import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Copy, User, Bike } from 'lucide-react'
import { Tela, CabecalhoInterno, TituloSecao } from '@/componentes/layout/Tela'
import { Card } from '@/componentes/ui/Card'
import { Botao } from '@/componentes/ui/Botao'
import { Carregando } from '@/componentes/ui/Carregando'
import { EstadoErro } from '@/componentes/ui/EstadoVazio'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { moeda, exibirPlaca, data, quilometragem, telefone, porcentagem } from '@/lib/formato'
import { usePermissoes } from '@/auth/usePermissoes'
import { ItensDoOrcamento } from '../ItensDoOrcamento'
import { StatusOrcamentoBadge } from '../StatusOrcamentoBadge'
import { obterOrcamento, duplicarOrcamento, statusEfetivo } from '../api'
import { AcoesDoOrcamento } from '../AcoesDoOrcamento'

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-rotulo text-claro-secundario">{rotulo}</span>
      <span className="text-corpo text-claro">{valor}</span>
    </div>
  )
}

export function DetalheOrcamento() {
  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()
  const toast = useToast()
  const cache = useQueryClient()
  const p = usePermissoes()

  const { data: orcamento, isPending, isError, refetch } = useQuery({
    queryKey: ['orcamento', id],
    queryFn: () => obterOrcamento(id!),
  })

  const duplicar = useMutation({
    mutationFn: () => duplicarOrcamento(id!),
    onSuccess: (novoId) => {
      void cache.invalidateQueries({ queryKey: ['orcamentos'] })
      toast.sucesso('Cópia criada como rascunho.')
      navegar(`/orcamentos/${novoId}/editar`)
    },
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  if (isPending) return <Carregando />
  if (isError) return <EstadoErro aoTentarDeNovo={() => void refetch()} />
  if (!orcamento) {
    return (
      <EstadoErro
        titulo="Orçamento não encontrado"
        descricao="Ele pode ter sido removido. Volte para a lista."
        aoTentarDeNovo={() => navegar('/orcamentos', { replace: true })}
      />
    )
  }

  const efetivo = statusEfetivo(orcamento)
  // Aprovado ou recusado vira documento: a OS nasceu dele, e mudar depois faria
  // a ordem contar uma história diferente da que o cliente aprovou.
  const podeEditar =
    p.editarOrcamentos && orcamento.status !== 'aprovado' && orcamento.status !== 'recusado'

  const soma = orcamento.itens.reduce((a, i) => a + Number(i.quantidade) * Number(i.valor_unitario), 0)

  return (
    <Tela>
      <CabecalhoInterno
        titulo={`Orçamento ${String(orcamento.numero).padStart(3, '0')}`}
        contexto={`Criado em ${data(orcamento.criado_em)}`}
        acao={<StatusOrcamentoBadge status={efetivo} />}
      />

      <Card>
        <div className="flex items-center gap-3 pb-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-acento-suave">
            <User aria-hidden size={20} className="text-claro" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-corpo font-medium text-claro">
              {orcamento.cliente?.nome ?? 'Cliente removido'}
            </p>
            {orcamento.cliente?.telefone && (
              <p className="text-apoio text-claro-secundario">
                {telefone(orcamento.cliente.telefone)}
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
              {orcamento.moto ? exibirPlaca(orcamento.moto.placa) : 'Moto removida'}
            </p>
            <p className="truncate text-apoio text-claro-secundario">
              {[orcamento.moto?.marca, orcamento.moto?.modelo].filter(Boolean).join(' ')}
              {orcamento.km_registrado ? ` · ${quilometragem(orcamento.km_registrado)}` : ''}
            </p>
          </div>
        </div>
      </Card>

      <TituloSecao>Itens</TituloSecao>
      <ItensDoOrcamento
        somenteLeitura
        itens={orcamento.itens.map((i) => ({
          chave: i.id,
          tipo: i.tipo,
          produto_id: i.produto_id,
          servico_id: i.servico_id,
          descricao: i.descricao,
          quantidade: Number(i.quantidade),
          valor_unitario: Number(i.valor_unitario),
        }))}
        aoMudar={() => undefined}
      />

      <TituloSecao>Resumo</TituloSecao>
      <Card>
        <Linha rotulo="Soma dos itens" valor={moeda(soma)} />
        {Number(orcamento.desconto) > 0 && (
          <Linha
            rotulo={
              orcamento.desconto_percentual != null
                ? `Desconto (${porcentagem(orcamento.desconto_percentual)})`
                : 'Desconto'
            }
            valor={`− ${moeda(orcamento.desconto)}`}
          />
        )}
        <div className="flex items-baseline justify-between gap-4 border-t border-borda-clara pt-3">
          <span className="text-secao text-claro">Total</span>
          <span className="text-destaque text-claro">{moeda(orcamento.valor_total)}</span>
        </div>
      </Card>

      <TituloSecao>Condições</TituloSecao>
      <Card>
        <Linha
          rotulo="Válido até"
          valor={orcamento.validade_ate ? data(orcamento.validade_ate) : '—'}
        />
        <Linha rotulo="Garantia" valor={`${orcamento.garantia_dias} dias sobre os serviços`} />
      </Card>

      {orcamento.observacoes && (
        <>
          <TituloSecao>Observações</TituloSecao>
          <Card>
            <p className="whitespace-pre-line text-corpo text-claro">{orcamento.observacoes}</p>
          </Card>
        </>
      )}

      {orcamento.motivo_recusa && (
        <>
          <TituloSecao>Motivo da recusa</TituloSecao>
          <Card>
            <p className="whitespace-pre-line text-corpo text-claro">{orcamento.motivo_recusa}</p>
          </Card>
        </>
      )}

      <AcoesDoOrcamento
        orcamento={orcamento}
        statusEfetivo={efetivo}
        podeAgir={p.editarOrcamentos}
      />

      <div className="flex flex-col gap-3 pt-6">
        {podeEditar && (
          <Botao
            largo
            variante="contorno"
            icone={<Pencil aria-hidden size={20} />}
            onClick={() => navegar(`/orcamentos/${orcamento.id}/editar`)}
          >
            Editar orçamento
          </Botao>
        )}
        {p.editarOrcamentos && (
          <Botao
            largo
            variante="contorno"
            carregando={duplicar.isPending}
            icone={<Copy aria-hidden size={20} />}
            onClick={() => duplicar.mutate()}
          >
            Duplicar
          </Botao>
        )}
      </div>
    </Tela>
  )
}
