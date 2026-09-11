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
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import {
  ATUALIZADO_EM,
  PRIVACIDADE as PRIVACIDADE_SECOES,
  TERMOS as TERMOS_SECOES,
  VERSAO_DOS_DOCUMENTOS,
  type Secao,
} from './documentos'

export function PaginaLegal({
  titulo,
  resumo,
  secoes,
}: {
  titulo: string
  resumo: string
  secoes: Secao[]
}) {
  return (
    <main className="mx-auto w-full max-w-leitura px-5 py-8 tablet:py-12">
      <Link
        to="/entrar"
        className="-ml-2 inline-flex min-h-toque items-center gap-1 pr-3 text-corpo text-acento-forte"
      >
        <ArrowLeft aria-hidden size={20} />
        Voltar
      </Link>

      <h1 className="pt-2 text-titulo text-em-fundo">{titulo}</h1>
      <p className="pt-1 text-corpo text-em-fundo-2">{resumo}</p>
      <p className="pt-1 text-apoio text-em-fundo-2">
        Versão {VERSAO_DOS_DOCUMENTOS} · atualizado em {ATUALIZADO_EM}
      </p>

      <div className="mt-6 rounded-card bg-superficie p-5 tablet:p-8">
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
      </div>

      <nav className="flex flex-wrap gap-4 pt-6 text-corpo text-acento-forte">
        <Link to="/termos" className="min-h-toque-fino">
          Termos de Uso
        </Link>
        <Link to="/privacidade" className="min-h-toque-fino">
          Política de Privacidade
        </Link>
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
