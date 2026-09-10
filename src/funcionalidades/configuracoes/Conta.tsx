/**
 * A conta da oficina: o plano, a situação, os dados e a saída.
 *
 * As três coisas ficam juntas de propósito. Quem vem aqui está fazendo uma
 * pergunta só — "como está minha relação com este sistema?" — e a resposta
 * honesta inclui a porta de saída no mesmo lugar que o plano.
 */
import { useState } from 'react'
import { Download, LogOut } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Botao } from '@/componentes/ui/Botao'
import { Modal } from '@/componentes/ui/Modal'
import { Selecao, AreaTexto } from '@/componentes/ui/Campo'
import { useToast } from '@/componentes/ui/Toast'
import { useAuth } from '@/auth/ProvedorAuth'
import { supabase } from '@/lib/supabase'
import { traduzirErro } from '@/lib/erros'
import { data as formatarData, moeda, diasAte } from '@/lib/formato'
import { planilhaDaExportacao, nomeDoArquivoDaExportacao } from '@/lib/planilha'
import type { StatusOficina } from '@/tipos/banco'
import { Assinatura } from './Assinatura'

const NOME_DA_SITUACAO: Record<StatusOficina, string> = {
  teste: 'Período de teste',
  ativa: 'Ativa',
  atrasada: 'Pagamento em atraso',
  bloqueada: 'Acesso bloqueado',
  suspensa: 'Suspensa',
  cancelada: 'Encerrada',
}

const TOM_DA_SITUACAO: Record<StatusOficina, string> = {
  teste: 'bg-atencao-fundo text-atencao',
  ativa: 'bg-sucesso-fundo text-sucesso',
  atrasada: 'bg-atencao-fundo text-atencao',
  bloqueada: 'bg-erro-fundo text-erro',
  suspensa: 'bg-erro-fundo text-erro',
  cancelada: 'bg-erro-fundo text-erro',
}

/** As razões que vale a pena separar. O campo livre continua existindo. */
const MOTIVOS = [
  { valor: 'preco', rotulo: 'Ficou caro para o meu movimento' },
  { valor: 'complicado', rotulo: 'Achei complicado de usar' },
  { valor: 'faltou', rotulo: 'Falta alguma coisa que eu preciso' },
  { valor: 'outro-sistema', rotulo: 'Vou usar outro sistema' },
  { valor: 'fechando', rotulo: 'A oficina está fechando' },
  { valor: 'outro', rotulo: 'Outro motivo' },
]

export function Conta() {
  const { oficina, situacao, recarregarUsuario } = useAuth()
  const toast = useToast()
  const [exportando, setExportando] = useState(false)
  const [abrindoSaida, setAbrindoSaida] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [detalhe, setDetalhe] = useState('')
  const [encerrando, setEncerrando] = useState(false)

  const plano = useQuery({
    queryKey: ['plano', oficina?.plano],
    enabled: Boolean(oficina?.plano),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('planos')
        .select('*')
        .eq('id', oficina!.plano)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  if (!oficina) return null

  async function exportar() {
    setExportando(true)
    try {
      const { data, error } = await supabase.rpc('exportar_dados_da_oficina')
      if (error) throw error
      const arquivo = planilhaDaExportacao(data as Record<string, unknown>)
      const endereco = URL.createObjectURL(arquivo)
      const link = document.createElement('a')
      link.href = endereco
      link.download = nomeDoArquivoDaExportacao(oficina!.nome)
      link.click()
      URL.revokeObjectURL(endereco)
      toast.sucesso('Seus dados foram baixados.')
    } catch (e) {
      toast.erro(traduzirErro(e))
    } finally {
      setExportando(false)
    }
  }

  async function encerrar() {
    setEncerrando(true)
    try {
      const razao = [motivo, detalhe.trim()].filter(Boolean).join(': ')
      const { error } = await supabase.rpc('pedir_encerramento_da_conta', {
        p_motivo: razao || null,
      })
      if (error) throw error
      await recarregarUsuario()
      setAbrindoSaida(false)
      toast.sucesso('Pedido registrado. Você tem 30 dias para mudar de ideia.')
    } catch (e) {
      toast.erro(traduzirErro(e))
    } finally {
      setEncerrando(false)
    }
  }

  async function desistir() {
    try {
      const { error } = await supabase.rpc('desistir_do_encerramento')
      if (error) throw error
      await recarregarUsuario()
      toast.sucesso('Pedido cancelado. Sua conta continua.')
    } catch (e) {
      toast.erro(traduzirErro(e))
    }
  }

  const saindo = Boolean(oficina.excluir_em)
  const diasParaSair = oficina.excluir_em ? diasAte(oficina.excluir_em) : null

  return (
    <div className="space-y-6">
      {/* Plano e situação --------------------------------------------------- */}
      <div className="rounded-card bg-superficie p-4 tablet:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-apoio text-claro-secundario">Seu plano</p>
            <p className="text-secao text-claro">{plano.data?.nome ?? '—'}</p>
            {plano.data?.descricao && (
              <p className="pt-1 text-apoio text-claro-secundario">{plano.data.descricao}</p>
            )}
          </div>
          {situacao && (
            <span
              className={`rounded-badge px-3 py-1 text-rotulo font-semibold ${TOM_DA_SITUACAO[situacao]}`}
            >
              {NOME_DA_SITUACAO[situacao]}
            </span>
          )}
        </div>

        <dl className="grid gap-4 pt-5 tablet:grid-cols-3">
          <div>
            <dt className="text-apoio text-claro-secundario">Mensalidade</dt>
            <dd className="text-corpo text-claro">
              {plano.data ? moeda(Number(plano.data.preco_mensal)) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-apoio text-claro-secundario">Pessoas com acesso</dt>
            <dd className="text-corpo text-claro">
              {plano.data?.limite_colaboradores == null
                ? 'Sem limite'
                : `Até ${plano.data.limite_colaboradores}`}
            </dd>
          </div>
          <div>
            <dt className="text-apoio text-claro-secundario">Acesso garantido até</dt>
            <dd className="text-corpo text-claro">
              {oficina.acesso_ate ? formatarData(oficina.acesso_ate) : 'Sem prazo'}
            </dd>
          </div>
        </dl>

      </div>

      {/* Planos e assinatura -------------------------------------------------- */}
      <Assinatura />

      {/* Levar os dados ------------------------------------------------------ */}
      <div className="rounded-card bg-superficie p-4 tablet:p-6">
        <p className="text-corpo text-claro">Seus dados são seus.</p>
        <p className="pt-1 text-apoio text-claro-secundario">
          Baixe tudo — clientes, motos, orçamentos, ordens de serviço, estoque e
          financeiro — numa pasta de planilhas que abre no Excel ou no Google
          Planilhas. Funciona em qualquer situação da conta, inclusive encerrada.
        </p>
        <div className="pt-4">
          <Botao
            type="button"
            variante="contorno-no-card"
            compactoNoDesktop
            carregando={exportando}
            icone={<Download aria-hidden size={18} />}
            onClick={() => void exportar()}
          >
            Baixar meus dados
          </Botao>
        </div>
      </div>

      {/* A saída -------------------------------------------------------------- */}
      <div className="rounded-card bg-superficie p-4 tablet:p-6">
        {saindo ? (
          <>
            <p className="text-corpo text-claro">
              Encerramento pedido. Seus dados continuam aqui até{' '}
              <strong>{formatarData(oficina.excluir_em!)}</strong>
              {diasParaSair !== null && diasParaSair >= 0 && (
                <> — faltam {diasParaSair} {diasParaSair === 1 ? 'dia' : 'dias'}</>
              )}
              .
            </p>
            <p className="pt-1 text-apoio text-claro-secundario">
              Nada foi apagado. Até essa data, dá para voltar atrás.
            </p>
            <div className="pt-4">
              <Botao
                type="button"
                variante="contorno-no-card"
                compactoNoDesktop
                onClick={() => void desistir()}
              >
                Quero continuar
              </Botao>
            </div>
          </>
        ) : (
          <>
            <p className="text-corpo text-claro">Encerrar a conta</p>
            <p className="pt-1 text-apoio text-claro-secundario">
              Seus dados ficam guardados por mais 30 dias, e nesse prazo dá para
              voltar atrás. Baixe suas planilhas antes.
            </p>
            <div className="pt-4">
              <Botao
                type="button"
                variante="perigo"
                icone={<LogOut aria-hidden size={18} />}
                onClick={() => setAbrindoSaida(true)}
              >
                Encerrar a conta
              </Botao>
            </div>
          </>
        )}
      </div>

      <Modal
        aberto={abrindoSaida}
        aoFechar={() => setAbrindoSaida(false)}
        titulo="Encerrar a conta"
      >
        <div className="space-y-4">
          <p className="text-corpo text-claro">
            Sua conta fica encerrada, mas <strong>nada é apagado agora</strong>. Os
            dados ficam guardados até{' '}
            {formatarData(new Date(Date.now() + 30 * 86_400_000).toISOString())}, e
            até lá você pode voltar atrás.
          </p>

          <Selecao
            rotulo="Por que está saindo?"
            dica="Ajuda a consertar o que estiver ruim."
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          >
            <option value="">Prefiro não dizer</option>
            {MOTIVOS.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.rotulo}
              </option>
            ))}
          </Selecao>

          <AreaTexto
            rotulo="Quer contar mais?"
            placeholder="O que faltou, o que atrapalhou…"
            value={detalhe}
            onChange={(e) => setDetalhe(e.target.value)}
          />

          <div className="flex flex-col gap-3 pt-2 tablet:flex-row tablet:justify-end">
            <Botao
              type="button"
              variante="contorno-no-card"
              compactoNoDesktop
              onClick={() => setAbrindoSaida(false)}
            >
              Voltar
            </Botao>
            <Botao
              type="button"
              variante="perigo"
              compactoNoDesktop
              carregando={encerrando}
              onClick={() => void encerrar()}
            >
              Confirmar o encerramento
            </Botao>
          </div>
        </div>
      </Modal>
    </div>
  )
}
