/**
 * A ajuda dentro do sistema.
 *
 * Duas perguntas diferentes, e por isso duas partes: "como eu faço isso?" e
 * "o que essa palavra quer dizer?". A segunda é a que salva quem entrou nesta
 * semana e não quer perguntar de novo o que é uma OS.
 *
 * Cada pessoa vê só o que ela pode fazer: mostrar ao mecânico o passo a passo
 * de cobrar o cliente é ensinar um caminho que a tela dele não tem.
 */
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, TriangleAlert, BookOpen, Volume2, Square, LifeBuoy } from 'lucide-react'
import { Tela, CabecalhoTela, TituloSecao } from '@/componentes/layout/Tela'
import { CampoBusca } from '@/componentes/ui/CampoBusca'
import { Abas } from '@/componentes/ui/Abas'
import { Card } from '@/componentes/ui/Card'
import { Badge } from '@/componentes/ui/Badge'
import { EstadoVazio } from '@/componentes/ui/EstadoVazio'
import { usePermissoes } from '@/auth/usePermissoes'
import { Botao } from '@/componentes/ui/Botao'
import { falar, pararDeFalar, useLeitura } from '@/lib/falar'
import { useAuth } from '@/auth/ProvedorAuth'
import { CONTATO } from '@/funcionalidades/legal/documentos'
import { GUIAS, VOCABULARIO, type Guia, type Secao } from './conteudo'

const SECOES: Array<{ id: Secao | 'todos'; rotulo: string }> = [
  { id: 'todos', rotulo: 'Tudo' },
  { id: 'Atendimento', rotulo: 'Atendimento' },
  { id: 'Serviço', rotulo: 'Serviço' },
  { id: 'Estoque', rotulo: 'Estoque' },
  { id: 'Dinheiro', rotulo: 'Dinheiro' },
  { id: 'Cadastros', rotulo: 'Cadastros' },
  { id: 'Fiscal', rotulo: 'Fiscal' },
]

/** Sem acento e em minúscula: quem procura "orcamento" acha "orçamento". */
const simplificar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export function Ajuda({ mostrarTudo = false }: { mostrarTudo?: boolean }) {
  const p = usePermissoes()
  const [busca, setBusca] = useState('')
  const [secao, setSecao] = useState<Secao | 'todos'>('todos')

  // `mostrarTudo` é só da porta de conferência em desenvolvimento, onde não há
  // usuário logado e, sem isto, a tela apareceria vazia para quem a escreve.
  const guias = useMemo(() => GUIAS.filter((g) => mostrarTudo || g.visivel(p)), [p, mostrarTudo])
  const termos = useMemo(
    () => VOCABULARIO.filter((t) => mostrarTudo || t.visivel(p)),
    [p, mostrarTudo],
  )

  const procurado = simplificar(busca.trim())

  const guiasVisiveis = guias.filter((g) => {
    if (secao !== 'todos' && g.secao !== secao) return false
    if (!procurado) return true
    return simplificar(`${g.titulo} ${g.resumo} ${g.passos.join(' ')}`).includes(procurado)
  })

  const termosVisiveis = termos.filter(
    (t) => !procurado || simplificar(`${t.termo} ${t.explicacao}`).includes(procurado),
  )

  // As seções que sobraram depois do perfil: mostrar "Fiscal" para quem não
  // tem financeiro seria oferecer uma gaveta vazia.
  const secoesComConteudo = SECOES.filter(
    (s) => s.id === 'todos' || guias.some((g) => g.secao === s.id),
  )

  return (
    <Tela>
      <CabecalhoTela
        titulo="Ajuda"
        contexto="Os caminhos do dia a dia e o que cada palavra quer dizer"
      />

      <CampoBusca
        rotulo="Procurar na ajuda"
        valor={busca}
        aoMudar={setBusca}
        placeholder="orçamento, estoque, garantia…"
      />

      {!procurado && (
        <div className="pt-3">
          <Abas rotulo="Assunto" abas={secoesComConteudo} ativa={secao} aoTrocar={setSecao} />
        </div>
      )}

      <TituloSecao>
        {procurado ? `Guias (${guiasVisiveis.length})` : 'Passo a passo'}
      </TituloSecao>

      {guiasVisiveis.length === 0 ? (
        <EstadoVazio
          icone={<BookOpen aria-hidden size={28} />}
          titulo={procurado ? 'Nada encontrado aqui' : 'Nenhum guia para o seu acesso'}
          descricao={
            procurado
              ? 'Tente outra palavra — ou procure no vocabulário, logo abaixo.'
              : 'O vocabulário abaixo continua valendo. Se você precisa de um caminho que não aparece, fale com quem administra a oficina.'
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {guiasVisiveis.map((g) => (
            <CartaoDoGuia key={g.id} guia={g} abertoPorPadrao={Boolean(procurado)} />
          ))}
        </div>
      )}

      <TituloSecao>
        {procurado ? `Vocabulário (${termosVisiveis.length})` : 'O que cada palavra quer dizer'}
      </TituloSecao>

      {termosVisiveis.length === 0 ? (
        <Card escuro>
          <p className="text-corpo text-em-fundo-2">Nenhuma palavra com esse termo.</p>
        </Card>
      ) : (
        <div className="grid gap-3 tablet:grid-cols-2 desktop:grid-cols-3">
          {termosVisiveis.map((t) => (
            <Card key={t.termo}>
              <p className="text-corpo font-semibold text-em-superficie">{t.termo}</p>
              <p className="pt-1 text-apoio text-em-superficie-2">{t.explicacao}</p>
            </Card>
          ))}
        </div>
      )}

      <PedirSuporte />
    </Tela>
  )
}

/**
 * O pedido de suporte.
 *
 * É por aqui (ou por e-mail direto) que a oficina pede ajuda — e é esse pedido
 * que autoriza a equipe a entrar na conta, como dizem os Termos e a Política
 * de Privacidade. O e-mail já sai com o nome da oficina, para ninguém ter de
 * perguntar de onde veio.
 */
function PedirSuporte() {
  const { oficina, usuario } = useAuth()
  const assunto = `Suporte GIRO — ${oficina?.nome ?? 'minha oficina'}`
  const corpo =
    `Olá! Preciso de ajuda com o GIRO.\n\n` +
    `Oficina: ${oficina?.nome ?? ''}\n` +
    `Quem pede: ${usuario?.nome ?? ''}\n\n` +
    `O que aconteceu:\n\n`
  const endereco = `mailto:${CONTATO}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`

  return (
    <Card className="mt-8">
      <div className="flex items-start gap-3">
        <LifeBuoy aria-hidden size={22} className="mt-0.5 shrink-0 text-em-superficie" />
        <div className="min-w-0">
          <p className="text-corpo font-semibold text-em-superficie">Não achou o que precisava?</p>
          <p className="pt-1 text-apoio text-em-superficie-2">
            Conte o que aconteceu. Se for preciso, nossa equipe entra na sua conta para ver de perto
            — com o motivo registrado e por no máximo 30 minutos.
          </p>
          <a
            href={endereco}
            className="mt-3 inline-flex h-botao items-center rounded-controle bg-acento px-5 text-corpo font-semibold text-em-superficie active:bg-acento-pressionado"
          >
            Pedir ajuda ao suporte
          </a>
          <p className="pt-2 text-apoio text-em-superficie-2">Ou escreva para {CONTATO}.</p>
        </div>
      </div>
    </Card>
  )
}

function CartaoDoGuia({ guia, abertoPorPadrao }: { guia: Guia; abertoPorPadrao: boolean }) {
  const [aberto, setAberto] = useState(abertoPorPadrao)
  const leitura = useLeitura()
  const falandoEste = leitura.falando === guia.id

  // O que se ouve é o que se lê: o título, cada passo com o número dele, e o
  // cuidado no fim.
  function ouvir() {
    if (falandoEste) {
      pararDeFalar()
      return
    }
    falar(guia.id, [
      guia.titulo,
      ...guia.passos.map((passo, i) => `Passo ${i + 1}. ${passo}`),
      ...(guia.atencao ? [`Atenção. ${guia.atencao}`] : []),
    ])
  }

  return (
    <Card>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <Badge>{guia.secao}</Badge>
          <span className="block pt-2 text-corpo font-semibold text-em-superficie">
            {guia.titulo}
          </span>
          <span className="block pt-1 text-apoio text-em-superficie-2">{guia.resumo}</span>
        </span>
        <span className="shrink-0 pt-1 text-em-superficie-2">
          {aberto ? (
            <ChevronUp aria-hidden size={20} />
          ) : (
            <ChevronDown aria-hidden size={20} />
          )}
        </span>
      </button>

      {aberto && (
        <div className="pt-4">
          {/* Só aparece se o aparelho sabe falar — quase todos sabem. */}
          {leitura.suportado && (
            <Botao
              variante="contorno-no-card"
              compactoNoDesktop
              className="mb-4"
              icone={
                falandoEste ? <Square aria-hidden size={18} /> : <Volume2 aria-hidden size={20} />
              }
              aria-pressed={falandoEste}
              onClick={ouvir}
            >
              {falandoEste ? 'Parar' : 'Ouvir o passo a passo'}
            </Botao>
          )}

          {/* Numerada de propósito: é uma sequência, e a ordem importa. */}
          <ol className="flex flex-col gap-3">
            {guia.passos.map((passo, i) => (
              <li key={passo} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-acento text-apoio font-semibold text-em-superficie">
                  {i + 1}
                </span>
                <span className="text-corpo text-em-superficie">{passo}</span>
              </li>
            ))}
          </ol>

          {guia.atencao && (
            <p className="mt-4 flex items-start gap-2 rounded-controle bg-atencao-fundo px-4 py-3 text-apoio text-atencao-forte">
              <TriangleAlert aria-hidden size={18} className="mt-0.5 shrink-0" />
              <span>{guia.atencao}</span>
            </p>
          )}
        </div>
      )}
    </Card>
  )
}
