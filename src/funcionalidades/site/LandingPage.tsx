/**
 * A página que o dono da oficina vê antes de existir uma conta.
 *
 * Três decisões que explicam o resto do arquivo:
 *
 * 1. Ela usa os tokens da marca, e não um visual próprio de landing page. Quem
 *    clica em "Testar grátis" cai no cadastro e, sete dias depois, no sistema —
 *    se a página parecer outra empresa, a primeira tela do produto vira uma
 *    pequena decepção. A página é a amostra.
 *
 * 2. Preço e benefícios NÃO estão escritos aqui: vêm da tabela `planos`, que é
 *    a mesma que a tela de assinatura lê. Texto de venda em dois lugares é
 *    promessa que um dia diverge do que o sistema cobra.
 *
 * 3. Nada de nota fiscal de saída. A entrada por XML do fornecedor existe e
 *    está descrita; emitir NF-e depende de serviço fiscal que ainda não foi
 *    contratado, e prometer isso aqui seria vender o que não se entrega.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  FileText,
  Package,
  Search,
  Smartphone,
  Wallet,
  Wrench,
} from 'lucide-react'
import { Logotipo, Simbolo } from '@/componentes/marca/Logotipo'
import { supabase } from '@/lib/supabase'
import { moeda } from '@/lib/formato'

interface PlanoNaPagina {
  id: string
  nome: string
  descricao: string
  preco_mensal: number
  dias_de_teste: number | null
  beneficios: string[]
}

/* O que dói, na ordem em que dói. -------------------------------------------- */
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

/* Como funciona, no vocabulário da bancada. ---------------------------------- */
const PASSOS = [
  {
    numero: '1',
    titulo: 'A moto chega',
    texto:
      'Você acha o cliente pela placa e monta o orçamento com peças e serviços do seu catálogo. Manda no WhatsApp num toque, com o preço por escrito.',
  },
  {
    numero: '2',
    titulo: 'O cliente aprova',
    texto:
      'A ordem de serviço nasce sozinha, com os itens do orçamento e o mecânico responsável. Cada passo fica registrado com quem fez e quando.',
  },
  {
    numero: '3',
    titulo: 'A moto sai',
    texto:
      'A peça baixa do estoque, a cobrança nasce da ordem e o PIX vai pelo WhatsApp. No fim do mês, o painel mostra o que entrou de verdade.',
  },
]

const BENEFICIOS = [
  {
    icone: FileText,
    titulo: 'Orçamento que vira documento',
    texto:
      'Em PDF, com a sua logo e a sua cor, pronto para mandar. Preço por escrito acaba com a discussão no balcão.',
  },
  {
    icone: Package,
    titulo: 'Estoque com extrato',
    texto:
      'Cada entrada e cada saída registrada, com motivo e responsável. O saldo bate com a prateleira porque ele nasce das movimentações.',
  },
  {
    icone: Search,
    titulo: 'A placa acha tudo',
    texto:
      'Digite a placa e veja a moto inteira: serviços feitos, peças trocadas, garantias, valores e o que o dono ainda deve.',
  },
  {
    icone: Wallet,
    titulo: 'O dinheiro à vista',
    texto:
      'Contas a receber e a pagar, quem está devendo e desde quando, e cobrança por PIX gerada da própria ordem de serviço.',
  },
  {
    icone: Wrench,
    titulo: 'Cada um vê o que é dele',
    texto:
      'O mecânico vê as ordens dele e não vê o preço de custo. O balcão atende. Só quem administra enxerga o dinheiro.',
  },
  {
    icone: Smartphone,
    titulo: 'Feito para a mão suja',
    texto:
      'Funciona no celular, com botão grande e letra grande. Nada de planilha que só abre no computador da sala.',
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
      'Foi feito para o celular primeiro, porque é onde a oficina trabalha. Também abre no computador do balcão, com a mesma conta.',
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
]

export function LandingPage() {
  const [planos, setPlanos] = useState<PlanoNaPagina[] | null>(null)

  useEffect(() => {
    void supabase.functions
      .invoke('cadastro', { body: { acao: 'planos' } })
      .then(({ data }) => setPlanos((data?.planos as PlanoNaPagina[]) ?? null))
      .catch(() => setPlanos(null))
  }, [])

  const pagos = (planos ?? []).filter((p) => Number(p.preco_mensal) > 0)

  return (
    <div className="min-h-dvh bg-fundo">
      <Cabecalho />
      <Dobra />
      <Dor />
      <Solucao />
      <Beneficios />
      <Precos planos={pagos} />
      <ProvaSocial />
      <Perguntas />
      <ChamadaFinal />
      <Rodape />
    </div>
  )
}

/* ---------------------------------------------------------------------------- */

function BotaoDeTeste({ largo = false, rotulo = 'Testar grátis por 7 dias' }) {
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
    <header className="flex items-center justify-between px-5 py-5 desktop:px-12">
      <Logotipo tamanho={30} />
      <Link
        to="/entrar"
        className="min-h-toque rounded-controle px-4 py-2 text-corpo font-medium text-em-fundo"
      >
        Entrar
      </Link>
    </header>
  )
}

function Dobra() {
  return (
    <section className="relative overflow-hidden px-5 pb-16 pt-6 desktop:px-12 desktop:pb-24 desktop:pt-10">
      {/* O símbolo enorme e cortado é o mesmo recurso da tela de entrar: dá peso
          à marca sem depender de foto, que ainda não temos com licença. */}
      <Simbolo
        tamanho="90%"
        className="pointer-events-none absolute -right-[22%] -top-[30%] hidden text-[#17171A] desktop:block"
      />

      <div className="relative mx-auto max-w-3xl desktop:mx-0 desktop:max-w-2xl">
        <p className="text-apoio font-semibold uppercase tracking-wide text-acento">
          Para oficina de moto
        </p>
        <h1 className="text-balance pt-3 text-[2rem] font-bold leading-tight text-em-fundo desktop:text-[3.25rem]">
          Sua oficina inteira na palma da mão, do orçamento ao dinheiro na conta.
        </h1>
        <p className="max-w-xl pt-5 text-[1.125rem] leading-relaxed text-em-fundo-2">
          Chega de orçamento de boca, peça que some e fim de mês que não fecha. O
          GIRO organiza a bancada, o estoque e o caixa no mesmo lugar — no celular,
          com a mão suja de graxa.
        </p>

        <div className="flex flex-col gap-3 pt-8 tablet:flex-row tablet:items-center">
          <BotaoDeTeste />
          <p className="text-apoio text-em-fundo-2">
            Sem cartão. Sem fidelidade. Leva menos de um minuto.
          </p>
        </div>

        <ul className="flex flex-wrap gap-x-6 gap-y-2 pt-8">
          {['7 dias com tudo aberto', 'Cancela quando quiser', 'Funciona no celular'].map((t) => (
            <li key={t} className="flex items-center gap-2 text-apoio text-em-fundo-2">
              <Check aria-hidden size={16} className="text-acento" />
              {t}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Dor() {
  return (
    <section className="bg-fundo-2 px-5 py-16 desktop:px-12 desktop:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-balance text-[1.75rem] font-bold leading-tight text-em-fundo desktop:text-[2.5rem]">
          Você não tem problema de trabalho. Tem problema de controle.
        </h2>
        <p className="max-w-2xl pt-4 text-corpo leading-relaxed text-em-fundo-2">
          A moto entra e sai, o serviço é bem feito, o cliente volta. Mas o que
          some entre uma coisa e outra é dinheiro seu — e some todo mês, no mesmo
          lugar:
        </p>

        <div className="grid gap-4 pt-10 tablet:grid-cols-2">
          {DORES.map(({ icone: Icone, titulo, texto }) => (
            <div
              key={titulo}
              className="rounded-card border border-borda-em-fundo bg-fundo p-6"
            >
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

function Solucao() {
  return (
    <section className="px-5 py-16 desktop:px-12 desktop:py-24">
      <div className="mx-auto max-w-5xl">
        <p className="text-apoio font-semibold uppercase tracking-wide text-acento">
          Como funciona
        </p>
        <h2 className="text-balance pt-3 text-[1.75rem] font-bold leading-tight text-em-fundo desktop:text-[2.5rem]">
          Três passos, e a oficina inteira fica registrada sozinha.
        </h2>

        <div className="grid gap-6 pt-10 tablet:grid-cols-3">
          {PASSOS.map(({ numero, titulo, texto }) => (
            <div key={numero}>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-acento text-corpo font-bold text-em-superficie">
                {numero}
              </span>
              <p className="pt-4 text-secao font-semibold text-em-fundo">{titulo}</p>
              <p className="pt-2 text-apoio leading-relaxed text-em-fundo-2">{texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Beneficios() {
  return (
    <section className="bg-superficie px-5 py-16 desktop:px-12 desktop:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-balance text-[1.75rem] font-bold leading-tight text-em-superficie desktop:text-[2.5rem]">
          O que muda na sua semana
        </h2>

        <div className="grid gap-6 pt-10 tablet:grid-cols-2 desktop:grid-cols-3">
          {BENEFICIOS.map(({ icone: Icone, titulo, texto }) => (
            <div key={titulo}>
              <span className="flex h-11 w-11 items-center justify-center rounded-controle bg-acento-suave">
                <Icone aria-hidden size={22} className="text-em-superficie" />
              </span>
              <p className="pt-4 text-corpo font-semibold text-em-superficie">{titulo}</p>
              <p className="pt-2 text-apoio leading-relaxed text-em-superficie-2">{texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Precos({ planos }: { planos: PlanoNaPagina[] }) {
  return (
    <section className="px-5 py-16 desktop:px-12 desktop:py-24">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-balance text-center text-[1.75rem] font-bold leading-tight text-em-fundo desktop:text-[2.5rem]">
          Custa menos que uma troca de óleo por mês
        </h2>
        <p className="mx-auto max-w-xl pt-4 text-center text-corpo text-em-fundo-2">
          Comece pelos sete dias com tudo aberto. Só depois você escolhe — e paga
          só se decidir ficar.
        </p>

        <div className="grid gap-4 pt-10 tablet:grid-cols-2">
          {planos.map((p) => (
            <div
              key={p.id}
              className="flex flex-col rounded-card border border-borda-em-fundo bg-fundo-2 p-6"
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

        <div className="pt-8">
          <BotaoDeTeste largo />
        </div>
      </div>
    </section>
  )
}

function ProvaSocial() {
  /*
   * Depoimentos com marcação, e não inventados.
   *
   * Texto de cliente que nunca falou é o tipo de atalho que custa a confiança
   * inteira quando alguém pergunta "posso falar com esse dono?". Ficam aqui, na
   * forma final, esperando as frases de verdade das primeiras oficinas.
   */
  const marcados = [
    '[Depoimento — Nome do dono, Nome da oficina, Cidade/UF]',
    '[Depoimento — Nome do dono, Nome da oficina, Cidade/UF]',
    '[Depoimento — Nome do dono, Nome da oficina, Cidade/UF]',
  ]

  return (
    <section className="bg-fundo-2 px-5 py-16 desktop:px-12 desktop:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-balance text-[1.75rem] font-bold leading-tight text-em-fundo desktop:text-[2.5rem]">
          Quem já está usando
        </h2>
        <div className="grid gap-4 pt-10 tablet:grid-cols-3">
          {marcados.map((m, i) => (
            <div
              key={i}
              className="rounded-card border border-dashed border-borda-em-fundo p-6 text-apoio text-em-fundo-2"
            >
              {m}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Perguntas() {
  return (
    <section className="bg-superficie px-5 py-16 desktop:px-12 desktop:py-24">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-balance text-[1.75rem] font-bold leading-tight text-em-superficie desktop:text-[2.5rem]">
          Perguntas que todo dono faz
        </h2>
        <div className="flex flex-col gap-3 pt-10">
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
    <div className="rounded-card border border-borda-em-superficie p-5">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
        className="flex min-h-toque w-full items-center justify-between gap-4 text-left"
      >
        <span className="text-corpo font-semibold text-em-superficie">{pergunta}</span>
        <ChevronDown
          aria-hidden
          size={20}
          className={`shrink-0 text-em-superficie-2 transition-transform ${aberta ? 'rotate-180' : ''}`}
        />
      </button>
      {aberta && (
        <p className="pt-3 text-corpo leading-relaxed text-em-superficie-2">{resposta}</p>
      )}
    </div>
  )
}

function ChamadaFinal() {
  return (
    <section className="px-5 py-20 desktop:px-12 desktop:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-balance text-[1.75rem] font-bold leading-tight text-em-fundo desktop:text-[2.5rem]">
          Amanhã de manhã a primeira moto entra. Ela pode entrar organizada.
        </h2>
        <p className="pt-4 text-corpo text-em-fundo-2">
          Sete dias com o sistema inteiro aberto, sem cartão. Se não servir para a
          sua oficina, é só parar de usar.
        </p>
        <div className="flex justify-center pt-8">
          <BotaoDeTeste />
        </div>
      </div>
    </section>
  )
}

function Rodape() {
  return (
    <footer className="border-t border-borda-em-fundo px-5 py-10 desktop:px-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 tablet:flex-row tablet:items-center tablet:justify-between">
        <Logotipo tamanho={24} />
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-apoio text-em-fundo-2">
          <Link to="/termos">Termos de Uso</Link>
          <Link to="/privacidade">Política de Privacidade</Link>
          <Link to="/entrar">Entrar</Link>
        </div>
      </div>
    </footer>
  )
}
