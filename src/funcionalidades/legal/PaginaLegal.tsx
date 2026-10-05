/**
 * A moldura dos dois documentos legais.
 *
 * São páginas públicas: quem está decidindo se assina precisa poder ler antes
 * de criar conta, e quem já é cliente precisa poder reler sem entrar.
 *
 * Largura de leitura, não de aplicativo. Texto jurídico em linha de ponta a
 * ponta num monitor largo é o que faz ninguém ler — e um contrato que ninguém
 * lê é um problema de quem escreveu, não de quem assinou.
 */
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  ATUALIZADO_EM,
  PRIVACIDADE as PRIVACIDADE_SECOES,
  TERMOS as TERMOS_SECOES,
  VERSAO_DOS_DOCUMENTOS,
  type Secao,
} from './documentos'

/** Onde a pessoa estava antes de abrir um documento. Ver LinkLegal. */
interface DeOnde {
  de?: string
}

/**
 * O link para um documento legal, de qualquer lugar do app.
 *
 * Leva junto de onde a pessoa saiu, para o "Voltar" do documento devolvê-la
 * ao mesmo lugar — a tela de entrar, a página de vendas na altura em que ela
 * estava, a tela "Mais". Antes, o "Voltar" mandava todo mundo para a tela de
 * entrar, de onde quer que tivesse vindo.
 *
 * Entre os dois documentos, a troca SUBSTITUI a entrada do histórico em vez
 * de empilhar: assim, ler os Termos, ir à Política e tocar em "Voltar" ainda
 * leva de volta à origem, e não ao outro documento.
 */
export function LinkLegal({
  para,
  className,
  children,
}: {
  para: 'termos' | 'privacidade'
  className?: string
  children: ReactNode
}) {
  const local = useLocation()
  const naLegal = local.pathname === '/termos' || local.pathname === '/privacidade'
  const de = naLegal
    ? (local.state as DeOnde | null)?.de
    : `${local.pathname}${local.search}${local.hash}`
  return (
    <Link to={`/${para}`} state={{ de }} replace={naLegal} className={className}>
      {children}
    </Link>
  )
}

/** As seções de um documento, sem a moldura — também usadas dentro do cadastro. */
export function CorpoDoDocumento({ secoes }: { secoes: Secao[] }) {
  return (
    <>
      {secoes.map((secao, i) => (
        <section key={secao.titulo} className={i > 0 ? 'pt-7' : undefined}>
          <h2 className="text-secao text-em-superficie">{secao.titulo}</h2>
          {secao.paragrafos.map((p) => (
            <p key={p} className="pt-2 text-corpo text-em-superficie-2">
              {p}
            </p>
          ))}
        </section>
      ))}
    </>
  )
}

export function PaginaLegal({
  titulo,
  resumo,
  secoes,
}: {
  titulo: string
  resumo: string
  secoes: Secao[]
}) {
  const local = useLocation()
  const navegar = useNavigate()
  const de = (local.state as DeOnde | null)?.de

  return (
    <main className="mx-auto w-full max-w-leitura px-5 py-8 tablet:py-12">
      {/* Veio de dentro do app: volta pelo histórico, que devolve a página do
          jeito que estava, inclusive a altura da rolagem. Chegou direto (link
          colado, aba nova): não há para onde voltar, então vai ao início. */}
      <button
        type="button"
        onClick={() => (de ? navegar(-1) : navegar('/'))}
        className="-ml-2 inline-flex min-h-toque items-center gap-1 pr-3 text-corpo text-acento-forte"
      >
        <ArrowLeft aria-hidden size={20} />
        Voltar
      </button>

      <h1 className="pt-2 text-titulo text-em-fundo">{titulo}</h1>
      <p className="pt-1 text-corpo text-em-fundo-2">{resumo}</p>
      <p className="pt-1 text-apoio text-em-fundo-2">
        Versão {VERSAO_DOS_DOCUMENTOS} · atualizado em {ATUALIZADO_EM}
      </p>

      <div className="mt-6 rounded-card bg-superficie p-5 tablet:p-8">
        <CorpoDoDocumento secoes={secoes} />
      </div>

      <nav className="flex flex-wrap gap-4 pt-6 text-corpo text-acento-forte">
        <LinkLegal para="termos" className="min-h-toque-fino">
          Termos de Uso
        </LinkLegal>
        <LinkLegal para="privacidade" className="min-h-toque-fino">
          Política de Privacidade
        </LinkLegal>
      </nav>
    </main>
  )
}

export function Termos() {
  return (
    <PaginaLegal
      titulo="Termos de Uso"
      resumo="O que você pode esperar do sistema, e o que esperamos de você."
      secoes={TERMOS_SECOES}
    />
  )
}

export function Privacidade() {
  return (
    <PaginaLegal
      titulo="Política de Privacidade"
      resumo="Que dados guardamos, por quê, e o que você pode fazer com eles."
      secoes={PRIVACIDADE_SECOES}
    />
  )
}
