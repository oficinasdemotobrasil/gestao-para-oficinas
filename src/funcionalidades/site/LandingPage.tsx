/**
 * A página que o dono da oficina vê antes de existir uma conta.
 *
 * A primeira versão contava o que o sistema faz. Esta MOSTRA: cada bloco de
 * recurso vem com a tela correspondente ao lado, desenhada em HTML (ver
 * TelasDoProduto). Quem vende software para quem nunca usou software precisa
 * mostrar a tela — a pessoa não está comprando "gestão", está comprando aquele
 * botão que manda o orçamento no WhatsApp.
 *
 * Três decisões que explicam o resto:
 *
 * 1. O visual é o do próprio produto, com os mesmos tokens. Quem clica cai no
 *    cadastro e, sete dias depois, no sistema — se a página parecer outra
 *    empresa, a primeira tela vira uma pequena decepção.
 *
 * 2. Preço e benefícios NÃO estão escritos aqui: vêm da tabela `planos`, a
 *    mesma que a tela de assinatura lê. Texto de venda em dois lugares é
 *    promessa que um dia diverge do que o sistema cobra.
 *
 * 3. Nada de emissão de nota fiscal. A entrada por XML do fornecedor existe e
 *    está descrita; emitir NF-e depende de serviço fiscal ainda não contratado,
 *    e a seção de perguntas diz isso com todas as letras.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  FileText,
  MessageCircle,
  Package,
  Search,
  ShieldCheck,
  Smartphone,
  Star,
  Wallet,
  Wrench,
} from 'lucide-react'
import { Logotipo, Simbolo } from '@/componentes/marca/Logotipo'
import { supabase } from '@/lib/supabase'
import { LinkLegal } from '@/funcionalidades/legal/PaginaLegal'
import {
  PERIODO_EM_DESTAQUE,
  ROTULO_DO_PERIODO,
  SUFIXO_DO_PERIODO,
  economia,
  porMes,
  useParcelas,
  usePrecos,
  useVagasVitalicias,
} from '@/funcionalidades/configuracoes/precos'
import { moeda } from '@/lib/formato'
import {
  Celular,
  TelaBusca,
  TelaFinanceiro,
  TelaOrcamento,
  TelaOrdem,
  TelaPainel,
} from './TelasDoProduto'

interface PlanoNaPagina {
  id: string
  nome: string
  descricao: string
  preco_mensal: number
  dias_de_teste: number | null
  beneficios: string[]
}

const DORES = [
  {
    icone: Clock,
    titulo: 'O orçamento de boca',
    texto:
      'Você fala um preço no balcão, o cliente some, volta duas semanas depois cobrando outro valor — e não há papel nenhum para mostrar.',
  },
  {
    icone: Package,
    titulo: 'A peça que some',
    texto:
      'Comprou dez, usou seis, a prateleira tem três. Ninguém sabe onde foi a sétima, e o prejuízo entra pelo ralo sem aparecer em lugar nenhum.',
  },
  {
    icone: Search,
    titulo: '“Que serviço fizeram na minha moto?”',
    texto:
      'O cliente pergunta e a resposta está num caderno embaixo da bancada, se estiver. Procurar leva dez minutos e às vezes não acha.',
  },
  {
    icone: Wallet,
    titulo: 'O fim do mês que não fecha',
    texto:
      'Entrou dinheiro, saiu dinheiro, e no dia 30 você não sabe se o mês foi bom. Quem ainda deve? Quanto você mesmo deve? Ninguém sabe.',
  },
]

/* Cada recurso com a tela dele ao lado. É o coração da página. ---------------- */
const RECURSOS = [
  {
    etiqueta: 'No balcão',
    titulo: 'Orçamento pronto antes de o cliente sair',
    texto:
      'Ache a moto pela placa, monte com peças e serviços do seu catálogo e mande no WhatsApp num toque. Preço por escrito acaba com a discussão duas semanas depois.',
    pontos: ['PDF com a sua logo e a sua cor', 'Validade e garantia em dias', 'Vira ordem de serviço na aprovação'],
    tela: <TelaOrcamento />,
    foto: '/site/balcao-entrega.webp',
  },
  {
    etiqueta: 'Na bancada',
    titulo: 'Você sabe o que cada mecânico está fazendo',
    texto:
      'A ordem nasce do orçamento aprovado, com o responsável e os itens. Cada passo fica registrado com quem fez e quando — e a peça sai do estoque na hora em que é usada.',
    pontos: ['Tempo de serviço por mecânico', 'Baixa de peça automática', 'Garantia contada da entrega'],
    tela: <TelaOrdem />,
    foto: '/site/mecanico-bancada.webp',
  },
  {
    etiqueta: 'No caixa',
    titulo: 'O dinheiro da oficina em uma tela só',
    texto:
      'A cobrança nasce da própria ordem de serviço. Veja quem está devendo e desde quando, gere o PIX e mande pelo WhatsApp sem constrangimento.',
    pontos: ['Contas a receber e a pagar', 'PIX gerado da ordem', 'Quem deve, quanto e desde quando'],
    tela: <TelaFinanceiro />,
    foto: '/site/moto-elevador.webp',
  },
  {
    etiqueta: 'No atendimento',
    titulo: 'A placa acha a moto inteira',
    texto:
      'Digite a placa e veja tudo: serviços feitos, peças trocadas, garantias em aberto, valores e o que o dono ainda deve. Responder ao cliente leva segundos.',
    pontos: ['Histórico completo da moto', 'Ficha do cliente com saldo', 'Busca por placa, nome ou nº da OS'],
    tela: <TelaBusca />,
    foto: '/site/celular-na-mao.webp',
  },
]

const PERGUNTAS = [
  {
    pergunta: 'Preciso cadastrar cartão para testar?',
    resposta:
      'Não. São sete dias com o sistema inteiro aberto, sem cartão e sem cobrança. No fim, você escolhe um plano ou simplesmente para de usar.',
  },
  {
    pergunta: 'Tenho anos de serviço anotados no caderno. Perco tudo?',
    resposta:
      'Não precisa perder. Dá para lançar serviços antigos com a data em que aconteceram, para o histórico da moto e do cliente começar completo — inclusive o que já foi pago.',
  },
  {
    pergunta: 'Minha equipe não tem paciência com sistema.',
    resposta:
      'Por isso o caminho é curto: da placa ao orçamento em poucos toques, e o mecânico só vê a tela dele. Tem uma área de ajuda dentro do sistema, com o passo a passo de cada tarefa e o que cada palavra quer dizer.',
  },
  {
    pergunta: 'Funciona no celular?',
    resposta:
      'Foi feito para o celular primeiro, porque é onde a oficina trabalha. Também abre no computador do balcão, com a mesma conta e os mesmos dados.',
  },
  {
    pergunta: 'E a nota fiscal?',
    resposta:
      'Hoje você lança a nota do fornecedor pelo XML, e ela já ajusta o estoque e lança a conta a pagar. A emissão das suas notas de saída está em preparação e será avisada quando entrar.',
  },
  {
    pergunta: 'Posso sair quando quiser?',
    resposta:
      'Pode. Não há fidelidade nem multa, e os seus dados podem ser exportados em planilha a qualquer momento.',
  },
  {
    pergunta: 'Quantas pessoas podem usar?',
    resposta:
      'Depende do plano: são dois ou cinco acessos, cada um com a sua senha. Durante o teste valem cinco, para a equipe inteira experimentar junto.',
  },
  {
    pergunta: 'Meus dados ficam seguros?',
    resposta:
      'Cada oficina só enxerga o que é dela, e isso é garantido no banco de dados, não só na tela. Dentro da oficina, o mecânico não vê preço de custo nem o financeiro.',
  },
]

/*
 * Depoimentos escritos como roteiro, esperando o dono confirmar.
 *
 * Cada um cita uma função que existe de verdade — é isso que separa depoimento
 * de elogio genérico: "o sistema é ótimo" não vende nada, "digito a placa e
 * aparece o histórico" vende. O caminho é mandar a frase para o cliente e
 * perguntar "é assim mesmo?": com o sim dele, deixa de ser texto nosso.
 *
 * O `quem` fica marcado até a pessoa existir. Trocar é editar esta lista — e
 * `DEPOIMENTOS_APROVADOS` abaixo esconde a seção inteira enquanto isso não
 * acontece, para quem visita não ler um colchete no lugar do nome.
 */
const DEPOIMENTOS = [
  {
    texto:
      'Antes eu falava o preço de boca e depois dava discussão. Agora monto o orçamento no balcão e mando no WhatsApp na hora — o cliente aprova pelo celular e a ordem de serviço já nasce sozinha.',
    quem: '[Nome] · [Oficina], [Cidade/UF]',
  },
  {
    texto:
      'O cliente liga perguntando o que foi feito na moto dele. Eu digito a placa e aparece tudo: serviço, peça trocada, garantia, valor. Antes eu procurava no caderno e às vezes não achava.',
    quem: '[Nome] · [Oficina], [Cidade/UF]',
  },
  {
    texto:
      'Eu comprava peça e sumia. Hoje a peça baixa do estoque na hora em que o mecânico usa, e o saldo bate com a prateleira. Só aí eu vi quanto estava perdendo por mês.',
    quem: '[Nome] · [Oficina], [Cidade/UF]',
  },
  {
    texto:
      'O que mudou mesmo foi saber quem está devendo e desde quando. Gero o PIX da própria ordem de serviço e mando — cobrar deixou de ser conversa constrangedora.',
    quem: '[Nome] · [Oficina], [Cidade/UF]',
  },
  {
    texto:
      'Tenho dois mecânicos e agora sei o tempo que cada um leva em cada serviço. Não é para vigiar ninguém: é para eu parar de prometer prazo que não dá.',
    quem: '[Nome] · [Oficina], [Cidade/UF]',
  },
  {
    texto:
      'No fim do mês eu abro o painel e vejo quantos orçamentos viraram serviço e quanto rendeu cada um. É a primeira vez que eu sei se o mês foi bom antes de olhar o extrato.',
    quem: '[Nome] · [Oficina], [Cidade/UF]',
  },
]

/*
 * Vire para `true` quando os nomes reais estiverem na lista acima.
 *
 * Enquanto for falso, a seção some da página publicada — porque um colchete no
 * lugar do nome, na seção que existe justamente para dar confiança, faz o
 * contrário do que ela deveria fazer. Em desenvolvimento ela aparece sempre,
 * para dar para conferir o texto no lugar.
 */
const DEPOIMENTOS_APROVADOS = false

export function LandingPage() {
  const [planos, setPlanos] = useState<PlanoNaPagina[] | null>(null)

  useEffect(() => {
    void supabase.functions
      .invoke('cadastro', { body: { acao: 'planos' } })
      .then(({ data }) => setPlanos((data?.planos as PlanoNaPagina[]) ?? null))
      .catch(() => setPlanos(null))
  }, [])

  return (
    <div className="min-h-dvh bg-fundo pb-24 desktop:pb-0">
      <Cabecalho />
      <Dobra />
      <FaixaDeConfianca />
      <Dor />
      <Recursos />
      <NoComputador />
      <Precos planos={(planos ?? []).filter((p) => Number(p.preco_mensal) > 0)} />
      <ProvaSocial />
      <Perguntas />
      <ChamadaFinal />
      <Rodape />
      <BarraFixaNoCelular />
    </div>
  )
}

/* ---------------------------------------------------------------------------- */

function BotaoDeTeste({
  largo = false,
  rotulo = 'Testar grátis por 7 dias',
}: {
  largo?: boolean
  rotulo?: string
}) {
  return (
    <Link
      to="/criar-conta"
      className={[
        'inline-flex min-h-toque items-center justify-center gap-2 rounded-controle',
        'bg-acento px-6 py-4 text-corpo font-semibold text-em-superficie',
        'transition-colors hover:bg-acento-pressionado',
        largo ? 'w-full' : '',
      ].join(' ')}
    >
      {rotulo}
      <ArrowRight aria-hidden size={20} />
    </Link>
  )
}

function Cabecalho() {
  return (
    <header className="sticky top-0 z-20 border-b border-borda-em-fundo bg-fundo/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 desktop:px-8">
        <Logotipo tamanho={28} />
        <div className="flex items-center gap-2">
          <Link
            to="/entrar"
            className="min-h-toque rounded-controle px-4 py-2 text-corpo font-medium text-em-fundo"
          >
            Entrar
          </Link>
          <Link
            to="/criar-conta"
            className="hidden min-h-toque items-center rounded-controle bg-acento px-5 py-2 text-corpo font-semibold text-em-superficie tablet:inline-flex"
          >
            Testar grátis
          </Link>
        </div>
      </div>
    </header>
  )
}

/**
 * A dobra, com o campo de e-mail.
 *
 * O campo não cria cadastro nem lista de contatos: ele leva o endereço para a
 * tela de criar conta, já preenchido. Começar a digitar é o que faz a pessoa
 * continuar — e uma lista de e-mails que ninguém trata é promessa quebrada com
 * quem digitou.
 */
function Dobra() {
  const navegar = useNavigate()
  const [email, setEmail] = useState('')

  return (
    <section className="relative overflow-hidden border-b border-borda-em-fundo">
      {/* A foto fica atrás de tudo, com véu chapado por cima — sem degradê,
          porque a identidade não usa, e é o véu que garante a leitura do texto
          sobre qualquer trecho da imagem. o ponto focal muda com a largura: no
          computador o texto ocupa a esquerda, então a foto mostra o lado vazio
          ali; no celular a coluna é estreita e recorta uma fatia fina, que
          presa à esquerda era só chão vazio — a foto sumia da página justo
          onde ela mais precisa dar vida. */}
      <img
        src="/site/oficina-panoramica.webp"
        alt=""
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover object-center desktop:object-left"
      />
      <span aria-hidden className="absolute inset-0 bg-fundo/85" />
      <Simbolo
        tamanho="80%"
        className="pointer-events-none absolute -right-[18%] -top-[26%] hidden text-[#17171A] desktop:block"
      />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-5 py-12 desktop:grid-cols-[1.1fr_auto] desktop:items-center desktop:px-8 desktop:py-20">
        <div>
          <p className="inline-flex items-center gap-2 rounded-badge bg-acento-suave px-3 py-1 text-apoio font-semibold text-em-superficie">
            <Wrench aria-hidden size={14} />
            Feito para oficina de moto
          </p>
          <h1 className="text-balance pt-5 text-[2.125rem] font-bold leading-[1.1] text-em-fundo desktop:text-[3.5rem]">
            Sua oficina inteira na palma da mão, do orçamento ao dinheiro na conta.
          </h1>
          <p className="max-w-xl pt-5 text-[1.0625rem] leading-relaxed text-em-fundo-2 desktop:text-[1.1875rem]">
            Chega de orçamento de boca, peça que some e fim de mês que não fecha. O
            GIRO organiza a bancada, o estoque e o caixa no mesmo lugar — no
            celular, com a mão suja de graxa.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              const limpo = email.trim()
              navegar(limpo ? `/criar-conta?email=${encodeURIComponent(limpo)}` : '/criar-conta')
            }}
            className="flex flex-col gap-3 pt-8 tablet:flex-row"
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Seu melhor e-mail"
              aria-label="Seu e-mail"
              className="min-h-toque flex-1 rounded-controle border border-borda-em-fundo bg-fundo-2 px-4 py-3 text-corpo text-em-fundo placeholder:text-em-fundo-2"
            />
            <button
              type="submit"
              className="inline-flex min-h-toque items-center justify-center gap-2 rounded-controle bg-acento px-6 py-4 text-corpo font-semibold text-em-superficie transition-colors hover:bg-acento-pressionado"
            >
              Começar grátis
              <ArrowRight aria-hidden size={20} />
            </button>
          </form>

          <ul className="flex flex-wrap gap-x-5 gap-y-2 pt-5">
            {['7 dias com tudo aberto', 'Sem cartão', 'Cancela quando quiser'].map((t) => (
              <li key={t} className="flex items-center gap-1.5 text-apoio text-em-fundo-2">
                <Check aria-hidden size={15} className="text-acento" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="hidden desktop:block">
          <Celular>
            <TelaOrcamento />
          </Celular>
        </div>
      </div>
    </section>
  )
}

function FaixaDeConfianca() {
  const itens = [
    { icone: Smartphone, texto: 'Funciona no celular da bancada' },
    { icone: MessageCircle, texto: 'Orçamento direto no WhatsApp' },
    { icone: ShieldCheck, texto: 'Cada oficina só vê os dados dela' },
    { icone: Wallet, texto: 'Recebimento por PIX' },
  ]
  return (
    <section className="border-b border-borda-em-fundo bg-fundo-2">
      <div className="mx-auto grid max-w-6xl gap-4 px-5 py-6 tablet:grid-cols-4 desktop:px-8">
        {itens.map(({ icone: Icone, texto }) => (
          <div key={texto} className="flex items-center gap-2">
            <Icone aria-hidden size={18} className="shrink-0 text-acento" />
            <span className="text-apoio text-em-fundo-2">{texto}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function Dor() {
  return (
    <section className="px-5 py-16 desktop:px-8 desktop:py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-balance text-[1.75rem] font-bold leading-tight text-em-fundo desktop:text-[2.5rem]">
          Você não tem problema de trabalho. Tem problema de controle.
        </h2>
        <p className="max-w-2xl pt-4 text-corpo leading-relaxed text-em-fundo-2">
          A moto entra e sai, o serviço é bem feito, o cliente volta. Mas o que
          some entre uma coisa e outra é dinheiro seu — e some todo mês, no mesmo
          lugar:
        </p>
        <div className="grid gap-4 pt-10 tablet:grid-cols-2 desktop:grid-cols-4">
          {DORES.map(({ icone: Icone, titulo, texto }) => (
            <div key={titulo} className="rounded-card border border-borda-em-fundo bg-fundo-2 p-6">
              <Icone aria-hidden size={24} className="text-acento" />
              <p className="pt-4 text-corpo font-semibold text-em-fundo">{titulo}</p>
              <p className="pt-2 text-apoio leading-relaxed text-em-fundo-2">{texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** O bloco central: recurso e tela, alternando o lado a cada linha. */
function Recursos() {
  return (
    <section className="bg-superficie px-5 py-16 desktop:px-8 desktop:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-apoio font-semibold uppercase tracking-wide text-em-superficie-2">
            Por dentro do sistema
          </p>
          <h2 className="text-balance pt-3 text-[1.75rem] font-bold leading-tight text-em-superficie desktop:text-[2.5rem]">
            Feito para a oficina que quer controlar melhor e lucrar mais
          </h2>
        </div>

        <div className="flex flex-col gap-16 pt-14 desktop:gap-24">
          {RECURSOS.map((r, i) => (
            <div
              key={r.titulo}
              className={[
                'grid items-center gap-8 desktop:grid-cols-2 desktop:gap-16',
                i % 2 === 1 ? 'desktop:[&>*:first-child]:order-2' : '',
              ].join(' ')}
            >
              <div>
                <p className="text-apoio font-semibold uppercase tracking-wide text-acento-forte">
                  {r.etiqueta}
                </p>
                <h3 className="text-balance pt-2 text-[1.375rem] font-bold leading-tight text-em-superficie desktop:text-[1.75rem]">
                  {r.titulo}
                </h3>
                <p className="pt-3 text-corpo leading-relaxed text-em-superficie-2">{r.texto}</p>
                <ul className="flex flex-col gap-2 pt-5">
                  {r.pontos.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-corpo text-em-superficie">
                      <Check aria-hidden size={18} className="mt-0.5 shrink-0 text-sucesso-forte" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="relative overflow-hidden rounded-card p-8">
                <img
                  src={r.foto}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <span aria-hidden className="absolute inset-0 bg-inverso/70" />
                <div className="relative">
                  <Celular>{r.tela}</Celular>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function NoComputador() {
  return (
    <section className="px-5 py-16 desktop:px-8 desktop:py-24">
      <div className="mx-auto max-w-5xl">
        <div className="max-w-2xl">
          <p className="text-apoio font-semibold uppercase tracking-wide text-acento">
            No computador do balcão
          </p>
          <h2 className="text-balance pt-3 text-[1.75rem] font-bold leading-tight text-em-fundo desktop:text-[2.5rem]">
            No fim do mês, os números que dizem se valeu a pena
          </h2>
          <p className="pt-4 text-corpo leading-relaxed text-em-fundo-2">
            Quantos orçamentos viraram serviço, quanto rende cada um, o que ainda
            está para receber. O mesmo login do celular, a mesma informação.
          </p>
        </div>
        <div className="grid items-center gap-8 pt-10 desktop:grid-cols-[1fr_1.15fr]">
          {/* A foto mostra a cena; o painel ao lado mostra o produto. Foto de
              banco de imagem com gráfico na tela seria dar a entender que
              aquele gráfico é o nosso. */}
          <img
            src="/site/computador-balcao.webp"
            alt="Dono de oficina no computador do balcão"
            loading="lazy"
            className="aspect-[4/3] w-full rounded-card object-cover"
          />
          <TelaPainel />
        </div>
      </div>
    </section>
  )
}

/**
 * Os preços, como período e não como plano (0082): um plano só, com tudo, e a
 * escolha é por quanto tempo. O anual em destaque, cada um dizendo quanto sai
 * por mês e quanto economiza, e o vitalício com as vagas que restam — o
 * número real, do banco.
 *
 * Antes da 0082 no banco, a tabela de preços não existe e a seção mostra os
 * planos como antes: a página nunca fica sem preço.
 */
function Precos({ planos }: { planos: PlanoNaPagina[] }) {
  const precos = usePrecos()
  const vagas = useVagasVitalicias()
  const anual12 = useParcelas('anual')
  const lista = precos.isError ? [] : (precos.data ?? [])
  const mensal = lista.find((p) => p.periodo === 'mensal')
  const beneficios = planos[planos.length - 1]?.beneficios ?? []
  const restam = vagas.data ?? 0
  const doze = anual12.data?.find((o) => o.parcelas === 12)

  return (
    <section className="bg-fundo-2 px-5 py-16 desktop:px-8 desktop:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-balance text-center text-[1.75rem] font-bold leading-tight text-em-fundo desktop:text-[2.5rem]">
          Custa menos que uma troca de óleo por mês
        </h2>
        <p className="mx-auto max-w-xl pt-4 text-center text-corpo text-em-fundo-2">
          Um plano só, com tudo liberado. Comece pelos sete dias de teste — e
          pague só se decidir ficar.
        </p>

        {lista.length > 0 ? (
          <>
            {beneficios.length > 0 && (
              <ul className="mx-auto grid max-w-3xl gap-2 pt-8 tablet:grid-cols-2">
                {beneficios.map((b) => (
                  <li key={b} className="flex gap-2 text-apoio text-em-fundo-2">
                    <Check aria-hidden size={16} className="mt-0.5 shrink-0 text-acento" />
                    {b}
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-4 pt-10 tablet:grid-cols-2 desktop:grid-cols-4">
              {lista.map((p) => {
                const destaque = p.periodo === PERIODO_EM_DESTAQUE
                const vitalicio = p.periodo === 'vitalicio'
                const mes = porMes(p)
                const economiza = economia(p, mensal)
                return (
                  <div
                    key={p.periodo}
                    className={[
                      'flex flex-col rounded-card border bg-fundo p-6',
                      destaque ? 'border-acento' : 'border-borda-em-fundo',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-secao font-semibold text-em-fundo">{ROTULO_DO_PERIODO[p.periodo]}</p>
                      {destaque && (
                        <span className="rounded-badge bg-acento px-2 py-0.5 text-micro font-semibold text-em-superficie">
                          Mais escolhido
                        </span>
                      )}
                    </div>
                    <p className="pt-3 text-[1.75rem] font-bold text-em-fundo">{moeda(Number(p.valor))}</p>
                    <p className="text-apoio text-em-fundo-2">{SUFIXO_DO_PERIODO[p.periodo]}</p>
                    <div className="flex-1 space-y-1 pt-4">
                      {mes !== null && p.periodo !== 'mensal' && (
                        <p className="text-apoio font-medium text-em-fundo">Sai por {moeda(mes)} por mês</p>
                      )}
                      {economiza > 0 && (
                        <p className="text-apoio font-semibold text-acento">Economize {moeda(economiza)}</p>
                      )}
                      {destaque && doze && (
                        <p className="text-apoio text-em-fundo-2">
                          Ou 12x de {moeda(doze.valorParcela)} no cartão
                        </p>
                      )}
                      {vitalicio && (
                        <p className="text-apoio font-semibold text-acento">
                          {restam > 0 ? `Restam ${restam} de 30 vagas` : 'Vagas esgotadas'}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="grid gap-4 pt-10 tablet:grid-cols-2">
            {planos.map((p, i) => (
              <div
                key={p.id}
                className={[
                  'flex flex-col rounded-card border bg-fundo p-6',
                  i === planos.length - 1 ? 'border-acento' : 'border-borda-em-fundo',
                ].join(' ')}
              >
                <p className="text-secao font-semibold text-em-fundo">{p.nome}</p>
                <p className="pt-1 text-apoio text-em-fundo-2">{p.descricao}</p>
                <p className="pt-4 text-[2rem] font-bold text-em-fundo">
                  {moeda(Number(p.preco_mensal))}
                  <span className="text-corpo font-normal text-em-fundo-2"> /mês</span>
                </p>
                <ul className="flex-1 space-y-2 pt-5">
                  {p.beneficios.map((b) => (
                    <li key={b} className="flex gap-2 text-apoio text-em-fundo-2">
                      <Check aria-hidden size={16} className="mt-0.5 shrink-0 text-acento" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="pt-8">
          <BotaoDeTeste largo />
        </div>
      </div>
    </section>
  )
}

function ProvaSocial() {
  if (!DEPOIMENTOS_APROVADOS && !import.meta.env.DEV) return null

  return (
    <section className="bg-superficie px-5 py-16 desktop:px-8 desktop:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="grid items-center gap-8 pb-4 desktop:grid-cols-[auto_1fr]">
          <img
            src="/site/retrato-mecanico.webp"
            alt=""
            loading="lazy"
            className="h-40 w-40 rounded-full object-cover desktop:h-48 desktop:w-48"
          />
          <div>
            <h2 className="text-balance text-[1.75rem] font-bold leading-tight text-em-superficie desktop:text-[2.5rem]">
              Quem já está usando
            </h2>
            <p className="max-w-xl pt-3 text-corpo text-em-superficie-2">
              Oficinas de bairro que trocaram o caderno pelo celular — e contam o
              que mudou na semana delas.
            </p>
          </div>
        </div>
        {!DEPOIMENTOS_APROVADOS && (
          <p className="pt-2 text-apoio text-atencao-forte">
            Rascunho: esta seção só vai ao ar quando os nomes forem reais.
          </p>
        )}
        <div className="grid gap-4 pt-10 tablet:grid-cols-2 desktop:grid-cols-3">
          {DEPOIMENTOS.map((d) => (
            <figure
              key={d.texto}
              className={[
                'flex flex-col rounded-card p-6',
                DEPOIMENTOS_APROVADOS
                  ? 'border border-borda-em-superficie'
                  : 'border border-dashed border-borda-em-superficie',
              ].join(' ')}
            >
              <div className="flex gap-0.5">
                {[0, 1, 2, 3, 4].map((e) => (
                  <Star key={e} aria-hidden size={16} className="text-acento" fill="currentColor" />
                ))}
              </div>
              <blockquote className="flex-1 pt-4 text-corpo leading-relaxed text-em-superficie-2">
                “{d.texto}”
              </blockquote>
              <figcaption className="pt-4 text-apoio font-semibold text-em-superficie">
                {d.quem}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

function Perguntas() {
  return (
    <section className="px-5 py-16 desktop:px-8 desktop:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-balance text-[1.75rem] font-bold leading-tight text-em-fundo desktop:text-[2.5rem]">
          Perguntas que todo dono faz
        </h2>
        <div className="grid gap-3 pt-10 desktop:grid-cols-2">
          {PERGUNTAS.map((p) => (
            <Pergunta key={p.pergunta} {...p} />
          ))}
        </div>
      </div>
    </section>
  )
}

function Pergunta({ pergunta, resposta }: { pergunta: string; resposta: string }) {
  const [aberta, setAberta] = useState(false)
  return (
    <div className="h-fit rounded-card border border-borda-em-fundo bg-fundo-2 p-5">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
        className="flex min-h-toque w-full items-center justify-between gap-4 text-left"
      >
        <span className="text-corpo font-semibold text-em-fundo">{pergunta}</span>
        <ChevronDown
          aria-hidden
          size={20}
          className={`shrink-0 text-em-fundo-2 transition-transform ${aberta ? 'rotate-180' : ''}`}
        />
      </button>
      {aberta && <p className="pt-3 text-corpo leading-relaxed text-em-fundo-2">{resposta}</p>}
    </div>
  )
}

function ChamadaFinal() {
  return (
    <section className="bg-acento px-5 py-16 desktop:px-8 desktop:py-20">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
        <FileText aria-hidden size={32} className="text-em-superficie" />
        <h2 className="text-balance text-[1.75rem] font-bold leading-tight text-em-superficie desktop:text-[2.5rem]">
          Amanhã de manhã a primeira moto entra. Ela pode entrar organizada.
        </h2>
        <p className="max-w-xl text-corpo text-em-superficie">
          Sete dias com o sistema inteiro aberto, sem cartão. Se não servir para a
          sua oficina, é só parar de usar.
        </p>
        <Link
          to="/criar-conta"
          className="inline-flex min-h-toque items-center justify-center gap-2 rounded-controle bg-inverso px-8 py-4 text-corpo font-semibold text-em-inverso"
        >
          Testar grátis por 7 dias
          <ArrowRight aria-hidden size={20} />
        </Link>
      </div>
    </section>
  )
}

function Rodape() {
  return (
    <footer className="px-5 py-10 desktop:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 tablet:flex-row tablet:items-center tablet:justify-between">
        <Logotipo tamanho={24} />
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-apoio text-em-fundo-2">
          <LinkLegal para="termos">Termos de Uso</LinkLegal>
          <LinkLegal para="privacidade">Política de Privacidade</LinkLegal>
          <Link to="/entrar">Entrar</Link>
        </div>
      </div>
    </footer>
  )
}

/**
 * No celular o botão acompanha a rolagem: a página é longa e o polegar é curto.
 *
 * Só aparece depois da dobra. Em cima ele ficaria colado no botão do formulário
 * — dois botões amarelos, um em cima do outro, dizendo a mesma coisa.
 */
function BarraFixaNoCelular() {
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    const aoRolar = () => setVisivel(window.scrollY > 700)
    aoRolar()
    window.addEventListener('scroll', aoRolar, { passive: true })
    return () => window.removeEventListener('scroll', aoRolar)
  }, [])

  if (!visivel) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-borda-em-fundo bg-fundo/95 p-3 backdrop-blur desktop:hidden">
      <BotaoDeTeste largo />
    </div>
  )
}
