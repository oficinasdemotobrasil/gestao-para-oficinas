import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { User, Bike, FileText } from 'lucide-react'
import { Tela, CabecalhoInterno, TituloSecao } from '@/componentes/layout/Tela'
import { Card } from '@/componentes/ui/Card'
import { Carregando } from '@/componentes/ui/Carregando'
import { EstadoErro } from '@/componentes/ui/EstadoVazio'
import { moeda, exibirPlaca, data, quilometragem, telefone, porcentagem } from '@/lib/formato'
import { nomeDoPerfil } from '@/auth/usePermissoes'
import { ItensDoOrcamento } from '@/funcionalidades/orcamentos/ItensDoOrcamento'
import { StatusOsBadge } from '../StatusOsBadge'
import { obterOrdemServico } from '../api'

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-rotulo text-claro-secundario">{rotulo}</span>
      <span className="text-corpo text-claro">{valor}</span>
    </div>
  )
}

/**
 * A ordem de serviço só de leitura.
 *
 * Ela existe agora porque aprovar um orçamento cria uma OS, e mandar a pessoa
 * para lugar nenhum depois de aprovar seria estranho. Trabalhar a ordem —
 * mudar status, apontar tempo, dar baixa no estoque — é a Fase 3.
 */
export function DetalheOrdemServico() {
  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()

  const { data: ordem, isPending, isError, refetch } = useQuery({
    queryKey: ['ordem-servico', id],
    queryFn: () => obterOrdemServico(id!),
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

  const soma = ordem.itens.reduce(
    (a, i) => a + Number(i.quantidade) * Number(i.valor_unitario),
    0,
  )
  // O desconto sai da própria ordem, não do orçamento: durante o serviço a OS
  // muda, e o orçamento deixa de descrever o que está sendo feito.
  const desconto = ordem.desconto_tipo === 'percentual'
    ? (soma * Number(ordem.desconto)) / 100
    : Number(ordem.desconto)

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

      <TituloSecao>Responsável</TituloSecao>
      <Card>
        {ordem.responsavel ? (
          <Linha
            rotulo={nomeDoPerfil[ordem.responsavel.perfil]}
            valor={ordem.responsavel.nome}
          />
        ) : (
          <p className="py-2 text-corpo text-claro-secundario">
            Ninguém atribuído ainda.
          </p>
        )}
      </Card>

      <TituloSecao>Serviço a executar</TituloSecao>
      <ItensDoOrcamento
        somenteLeitura
        itens={ordem.itens.map((i) => ({
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
          <span className="text-destaque text-claro">{moeda(ordem.valor_total)}</span>
        </div>
        <Linha
          rotulo="Garantia até"
          valor={ordem.garantia_ate ? data(ordem.garantia_ate) : '—'}
        />
        {ordem.data_conclusao && (
          <Linha rotulo="Concluída em" valor={data(ordem.data_conclusao)} />
        )}
      </Card>

      {ordem.observacoes && (
        <>
          <TituloSecao>Observações</TituloSecao>
          <Card>
            <p className="whitespace-pre-line text-corpo text-claro">{ordem.observacoes}</p>
          </Card>
        </>
      )}

      {/* O mecânico não lê orçamento: para ele o link levaria a uma porta
          fechada, e o app o devolveria para o início sem explicar nada. */}
      {ordem.orcamento_id && ordem.orcamento && (
        <Link
          to={`/orcamentos/${ordem.orcamento_id}`}
          className="mt-8 flex min-h-toque items-center justify-center gap-2 rounded-controle border border-borda-escura px-5 text-corpo font-semibold text-escuro"
        >
          <FileText aria-hidden size={20} />
          Ver o orçamento aprovado
        </Link>
      )}

      <p className="px-1 pt-6 text-apoio text-escuro-secundario">
        Andamento, apontamento de tempo e baixa de estoque entram na Fase 3.
      </p>
    </Tela>
  )
}
