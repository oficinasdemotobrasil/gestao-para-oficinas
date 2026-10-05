import { useState, type ReactNode } from 'react'
import {
  dinheiro,
  ROTULO_CALCULADO,
  ROTULO_DO_PLANO,
  ROTULO_DO_PERIODO,
  alertaDeFotos,
  type OficinaNaLista,
  type SituacaoCalculada,
} from './plataforma'

/**
 * Tudo o que a ficha de uma oficina sabe fazer com um dado: abrir a conversa,
 * o e-mail, o mapa. Nada aqui envia coisa alguma sozinho — o link abre o
 * WhatsApp ou o e-mail com o texto escrito, e quem aperta enviar é você,
 * depois de ler. Mensagem de cobrança que sai errada não tem desfazer.
 */

/** Onde a oficina assina ou regulariza. Fica em Configurações › Sua conta. */
const ENDERECO_DO_APP = 'https://gestao-para-oficinas.vercel.app'
const ONDE_ASSINAR = `${ENDERECO_DO_APP}/configuracoes`

/**
 * Data sem hora ("2026-10-02") é lida pelo navegador como meia-noite em
 * Londres — que no Brasil ainda é o dia anterior. A lista mostrou 01/10 para
 * um prazo de 02/10 por causa disso. Meio-dia local não cai em dia vizinho em
 * fuso nenhum do país.
 */
export const data = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR')

/** Dias inteiros de hoje até a data. Negativo é passado. */
function diasAte(iso: string): number {
  const alvo = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  alvo.setHours(0, 0, 0, 0)
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000)
}

export function diasSemEntrar(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

// O painel não importa nada do app (ver vite.config.ts), então a regra do
// número vive aqui também. É a mesma de src/lib/whatsapp.ts.
function numeroInternacional(telefone: string | null): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '')
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`
  if (digitos.length === 12 || digitos.length === 13) return digitos
  return null
}

/**
 * O painel é usado no computador, e lá o wa.me para numa página intermediária
 * pedindo outro clique. O WhatsApp Web vai direto na conversa.
 */
export function linkDoWhatsApp(telefone: string | null, texto: string): string {
  const numero = numeroInternacional(telefone)
  const t = encodeURIComponent(texto)
  // Sem número, o wa.me ao menos abre a escolha do contato com o texto pronto.
  if (!numero) return `https://wa.me/?text=${t}`
  return `https://web.whatsapp.com/send?phone=${numero}&text=${t}`
}

// encodeURIComponent, e não URLSearchParams: o mailto quer espaço como %20, e
// o URLSearchParams escreve "+", que alguns programas de e-mail mostram literal.
export const linkDoEmail = (email: string, assunto: string, corpo: string) =>
  `mailto:${email}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`

const linkDoMapa = (endereco: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`

const linkDaLigacao = (telefone: string) => `tel:+${numeroInternacional(telefone) ?? telefone.replace(/\D/g, '')}`

/** O primeiro responsável, e o telefone por onde falar com a oficina. */
export function contatoPrincipal(o: OficinaNaLista) {
  const pessoa = o.responsaveis[0] ?? null
  // O celular de quem decide vale mais que o fixo do balcão.
  const telefone = pessoa?.telefone || o.telefone || null
  return { pessoa, telefone, primeiroNome: pessoa?.nome.split(' ')[0] ?? '' }
}

export interface Mensagem {
  /** O que aparece no botão. */
  rotulo: string
  assunto: string
  texto: string
}

/**
 * A mensagem certa para o momento da oficina.
 *
 * O gatilho de cada uma é o que a pessoa perde, dito com a data de verdade —
 * não urgência inventada. "Seu teste termina dia 02/10" move mais do que
 * "últimas horas!", e não queima a confiança de quem lê.
 */
export function mensagemDaSituacao(o: OficinaNaLista): Mensagem {
  const { primeiroNome } = contatoPrincipal(o)
  const oi = primeiroNome ? `Oi, ${primeiroNome}! ` : 'Oi! '
  const eu = 'Aqui é o Ed, do GIRO.'
  const prazo = o.acesso_ate ?? o.teste_ate
  const fim = prazo ? data(prazo) : null
  const faltam = prazo ? diasAte(prazo) : null
  const plano = ROTULO_DO_PLANO[o.plano]

  const porSituacao: Record<SituacaoCalculada, Mensagem> = {
    teste: {
      rotulo: 'Fim do teste',
      assunto: `Seu teste do GIRO ${faltam !== null && faltam <= 0 ? 'termina hoje' : `termina em ${fim ?? 'breve'}`}`,
      texto:
        `${oi}${eu} ` +
        (faltam === null
          ? `Você está no período de teste na ${o.nome}.`
          : faltam <= 0
            ? `O teste da ${o.nome} termina hoje.`
            : `O teste da ${o.nome} termina em ${faltam} ${faltam === 1 ? 'dia' : 'dias'}, no dia ${fim}.`) +
        ` Para não parar no meio de um atendimento, dá para assinar em um minuto e continuar com tudo o que já está cadastrado: ${ONDE_ASSINAR}\n\n` +
        'Se ficou alguma dúvida sobre o sistema, me responde aqui que eu te ajudo.',
    },
    atrasada: {
      rotulo: 'Cobrar mensalidade',
      assunto: 'Mensalidade do GIRO em aberto',
      texto:
        `${oi}${eu} A mensalidade do plano ${plano} da ${o.nome} venceu${fim ? ` em ${fim}` : ''} e ainda não encontrei o pagamento.\n\n` +
        'Por enquanto você continua usando normalmente, mas se não for regularizado o sistema bloqueia novos orçamentos e ordens de serviço. ' +
        `Para acertar: ${ONDE_ASSINAR}\n\n` +
        'Se você já pagou, me avisa que eu confiro aqui.',
    },
    bloqueada: {
      rotulo: 'Renovar acesso',
      assunto: 'O acesso ao GIRO está bloqueado',
      texto:
        `${oi}${eu} O acesso da ${o.nome} está bloqueado${fim ? ` desde ${fim}` : ''} por falta de pagamento.\n\n` +
        'Seus clientes, motos e o histórico continuam todos guardados — só não dá para registrar nada novo. ' +
        `É regularizar e voltar a trabalhar na hora: ${ONDE_ASSINAR}\n\n` +
        'Se precisar de outra forma de pagamento, me fala.',
    },
    suspensa: {
      rotulo: 'Reativar conta',
      assunto: 'Sua conta no GIRO está suspensa',
      texto:
        `${oi}${eu} A conta da ${o.nome} está suspensa, e por isso não dá para registrar nada novo. Seus dados continuam guardados.\n\n` +
        'Me responde aqui que eu te ajudo a reativar.',
    },
    ativa: {
      rotulo: 'Perguntar se está tudo bem',
      assunto: 'Tudo certo com o GIRO?',
      texto:
        `${oi}${eu} Passando para saber se está tudo certo com o sistema na ${o.nome}. ` +
        'Tem alguma coisa travando, ou alguma função que você queria e não achou? Me responde aqui.',
    },
    cancelada: {
      rotulo: 'Convidar a voltar',
      assunto: 'Sentimos sua falta no GIRO',
      texto:
        `${oi}${eu} Vi que a ${o.nome} encerrou a conta no GIRO. ` +
        'Posso te perguntar o que faltou? Sua resposta ajuda a melhorar o sistema.\n\n' +
        'E se quiser voltar, é só me chamar aqui que eu reativo.',
    },
  }
  return porSituacao[o.situacao]
}

/** Quem nunca entrou ou sumiu. É o aviso antes do cancelamento. */
export function mensagemDeAusencia(o: OficinaNaLista): Mensagem | null {
  const { primeiroNome } = contatoPrincipal(o)
  const oi = primeiroNome ? `Oi, ${primeiroNome}! ` : 'Oi! '
  const dias = diasSemEntrar(o.ultimo_acesso)

  if (dias === null) {
    return {
      rotulo: 'Ajudar a começar',
      assunto: 'Posso te ajudar a começar no GIRO?',
      texto:
        `${oi}Aqui é o Ed, do GIRO. Vi que a ${o.nome} ainda não começou a usar o sistema. ` +
        'Quer que eu te mostre o primeiro orçamento? Leva uns cinco minutos, e dá para fazer pelo celular.\n\n' +
        `Para entrar: ${ENDERECO_DO_APP}`,
    }
  }
  if (dias >= 14) {
    return {
      rotulo: 'Chamar de volta',
      assunto: 'Aconteceu alguma coisa?',
      texto:
        `${oi}Aqui é o Ed, do GIRO. Faz ${dias} dias que ninguém da ${o.nome} entra no sistema. ` +
        'Aconteceu alguma coisa? Se algo travou ou ficou confuso, me conta que eu resolvo com você.',
    }
  }
  return null
}

/* A ficha ------------------------------------------------------------------ */

const classeDoLink =
  'text-claro underline decoration-borda-clara underline-offset-4 hover:decoration-claro'

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-claro-secundario">{rotulo}</dt>
      <dd className="text-sm text-claro">{children}</dd>
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-claro-secundario">
        {titulo}
      </h3>
      <dl className="flex flex-col gap-3">{children}</dl>
    </section>
  )
}

function Copiar({ valor }: { valor: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(valor).then(() => {
          setCopiado(true)
          setTimeout(() => setCopiado(false), 1500)
        })
      }}
      className={classeDoLink}
      title="Copiar"
    >
      {copiado ? 'Copiado' : valor}
    </button>
  )
}

/** Como o dono da oficina escreveria: (81) 99999-0000. */
function telefoneLegivel(numero: string): string {
  const d = numero.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return numero
}

function Telefone({ numero, texto }: { numero: string; texto: string }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <a href={linkDoWhatsApp(numero, texto)} target="_blank" rel="noreferrer" className={classeDoLink}>
        {telefoneLegivel(numero)}
      </a>
      <a href={linkDaLigacao(numero)} className="text-xs text-claro-secundario hover:text-claro">
        ligar
      </a>
    </span>
  )
}

/** Um par de botões: a mesma mensagem por WhatsApp e por e-mail. */
function Enviar({ o, mensagem, destaque }: { o: OficinaNaLista; mensagem: Mensagem; destaque?: boolean }) {
  const { pessoa, telefone } = contatoPrincipal(o)
  return (
    <div className="flex flex-col gap-2 rounded-controle border border-borda-clara p-3">
      <p className="text-sm font-medium text-claro">{mensagem.rotulo}</p>
      <p className="line-clamp-3 whitespace-pre-line text-xs text-claro-secundario">{mensagem.texto}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        <a
          href={linkDoWhatsApp(telefone, mensagem.texto)}
          target="_blank"
          rel="noreferrer"
          className={[
            'inline-flex h-9 items-center rounded-controle px-3 text-sm font-semibold',
            destaque ? 'bg-acento text-claro' : 'border border-borda-clara text-claro',
          ].join(' ')}
        >
          {telefone ? 'WhatsApp' : 'WhatsApp (escolher contato)'}
        </a>
        {pessoa && (
          <a
            href={linkDoEmail(pessoa.email, mensagem.assunto, mensagem.texto)}
            className="inline-flex h-9 items-center rounded-controle border border-borda-clara px-3 text-sm text-claro"
          >
            E-mail
          </a>
        )}
      </div>
    </div>
  )
}

export function FichaDaOficina({ o }: { o: OficinaNaLista }) {
  const { telefone } = contatoPrincipal(o)
  const situacao = mensagemDaSituacao(o)
  const ausencia = mensagemDeAusencia(o)
  const conversa = mensagemDaSituacao({ ...o, situacao: 'ativa' }).texto
  const enderecoCompleto = [o.endereco, o.cidade].filter(Boolean).join(', ')
  const pedidoDeSaida = o.exclusao_pedida_em ?? o.excluir_em

  return (
    <div className="grid gap-8 bg-borda-clara/30 px-4 py-6 tablet:grid-cols-2 desktop:grid-cols-4">
      <Bloco titulo="Responsáveis">
        {o.responsaveis.length === 0 && (
          <p className="text-sm text-claro-secundario">Nenhum administrador ativo.</p>
        )}
        {o.responsaveis.map((p) => (
          <Linha key={p.email} rotulo={p.nome}>
            <span className="flex flex-col gap-1">
              <a
                href={linkDoEmail(p.email, `GIRO — ${o.nome}`, `Oi, ${p.nome.split(' ')[0]}!\n\n`)}
                className={`${classeDoLink} break-all`}
              >
                {p.email}
              </a>
              {p.telefone && <Telefone numero={p.telefone} texto={conversa} />}
            </span>
          </Linha>
        ))}
      </Bloco>

      <Bloco titulo="Oficina">
        <Linha rotulo="Telefone">
          {o.telefone ? <Telefone numero={o.telefone} texto={conversa} /> : 'Não cadastrado'}
        </Linha>
        <Linha rotulo="CNPJ ou CPF">{o.cnpj ? <Copiar valor={o.cnpj} /> : 'Não cadastrado'}</Linha>
        <Linha rotulo="Endereço">
          {enderecoCompleto ? (
            <a href={linkDoMapa(enderecoCompleto)} target="_blank" rel="noreferrer" className={classeDoLink}>
              {enderecoCompleto}
            </a>
          ) : (
            'Não cadastrado'
          )}
        </Linha>
        <Linha rotulo="Termos de uso">
          {o.termos_aceitos_em ? `Aceitos em ${data(o.termos_aceitos_em)}` : 'Não aceitou ainda'}
        </Linha>
      </Bloco>

      <Bloco titulo="Assinatura">
        <Linha rotulo="Plano">
          {ROTULO_DO_PLANO[o.plano]}
          {o.mensalidade ? ` · ${dinheiro(o.mensalidade)}/mês` : ''}
        </Linha>
        <Linha rotulo="Situação hoje">{ROTULO_CALCULADO[o.situacao]}</Linha>
        {o.vitalicia && <Linha rotulo="Pagamento">Vitalícia — sem mensalidade</Linha>}
        {!o.vitalicia && o.assinatura?.periodo && (
          <Linha rotulo="Pagamento">
            {ROTULO_DO_PERIODO[o.assinatura.periodo]}
            {o.assinatura.valor ? ` · ${dinheiro(Number(o.assinatura.valor))}` : ''}
            {(o.assinatura.parcelas ?? 1) > 1 ? ` em ${o.assinatura.parcelas}x no cartão` : ''}
          </Linha>
        )}
        {o.fotos && (
          <Linha rotulo="Fotos de OS guardadas">
            {o.fotos.em_uso}
            {o.fotos.limite != null ? ` de ${o.fotos.limite}` : ' (sem limite)'}
            {alertaDeFotos(o) === 'limite' && (
              <span className="block text-xs text-erro-forte">No limite: oferecer o plano maior.</span>
            )}
            {alertaDeFotos(o) === 'atencao' && (
              <span className="block text-xs text-atencao-forte">Perto do limite.</span>
            )}
          </Linha>
        )}
        {o.assinatura ? (
          <>
            <Linha rotulo="Assinante desde">{data(o.assinatura.inicio)}</Linha>
            <Linha rotulo="Próxima cobrança">
              {o.assinatura.proxima_cobranca ? data(o.assinatura.proxima_cobranca) : '—'}
            </Linha>
          </>
        ) : (
          <Linha rotulo="Contrato">Nunca assinou ou já encerrou</Linha>
        )}
        {o.teste_ate && <Linha rotulo="Teste até">{data(o.teste_ate)}</Linha>}
        <Linha rotulo="Acesso até">{o.acesso_ate ? data(o.acesso_ate) : 'Sem prazo'}</Linha>
        {pedidoDeSaida && (
          <Linha rotulo="Pediu para sair">
            {data(pedidoDeSaida)}
            {o.motivo_da_saida && (
              <span className="block text-xs text-claro-secundario">“{o.motivo_da_saida}”</span>
            )}
          </Linha>
        )}
      </Bloco>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-claro-secundario">
          Mensagens prontas
        </h3>
        <Enviar o={o} mensagem={situacao} destaque={o.situacao !== 'ativa'} />
        {ausencia && <Enviar o={o} mensagem={ausencia} destaque />}
        <p className="text-xs text-claro-secundario">
          Abre com o texto escrito{telefone ? '' : ' — sem telefone no cadastro, você escolhe o contato'}.
          Nada sai sem você apertar enviar.
        </p>
      </section>
    </div>
  )
}
