/**
 * O certificado digital A1 da oficina.
 *
 * A decisão que define esta tela inteira: **o arquivo não é guardado.**
 *
 * Um A1 assina documento legal em nome da empresa — com ele se emite nota
 * fiscal no CNPJ do dono. Guardar milhares deles seria virar depositário de
 * poder de assinatura de milhares de empresas, e um vazamento nosso viraria
 * fraude no nome delas. Então o arquivo é aberto aqui mesmo, no aparelho de
 * quem subiu, conferido, e descartado. Fica registrado só o que a tela
 * precisa saber depois: de quem é, e até quando vale.
 *
 * A conferência local existe para o erro não aparecer semanas depois. Senha
 * errada é o engano mais comum com certificado, e sem conferir na hora a
 * pessoa só descobriria quando nota nenhuma chegasse.
 */
import { useRef, useState } from 'react'
import { ShieldCheck, ShieldAlert, Upload, TriangleAlert } from 'lucide-react'
import { Botao } from '@/componentes/ui/Botao'
import { Campo } from '@/componentes/ui/Campo'
import { useToast } from '@/componentes/ui/Toast'
import { useAuth } from '@/auth/ProvedorAuth'
import { supabase } from '@/lib/supabase'
import { traduzirErro } from '@/lib/erros'
import { data as formatarData } from '@/lib/formato'
import {
  lerCertificado,
  formatarCnpj,
  CertificadoInvalido,
  type CertificadoLido,
} from './lerCertificado'

/** Com menos de 30 dias, a tela para de ser informativa e passa a cobrar. */
const DIAS_PARA_AVISAR = 30

export function CertificadoDigital() {
  const { oficina, recarregarUsuario } = useAuth()
  const toast = useToast()
  const entrada = useRef<HTMLInputElement>(null)

  const [arquivo, setArquivo] = useState<File | null>(null)
  const [senha, setSenha] = useState('')
  const [lido, setLido] = useState<CertificadoLido | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [conferindo, setConferindo] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const jaConfigurado = Boolean(oficina?.certificado_configurado_em)
  const validoAte = oficina?.certificado_valido_ate
  const diasRestantes = validoAte
    ? Math.floor((new Date(validoAte + 'T12:00:00').getTime() - Date.now()) / 86400000)
    : null

  async function conferir(arquivoEscolhido: File, senhaDigitada: string) {
    setConferindo(true)
    setErro(null)
    setLido(null)
    try {
      const resultado = lerCertificado(await arquivoEscolhido.arrayBuffer(), senhaDigitada)

      if (resultado.vencido) {
        setErro(
          `Este certificado venceu em ${formatarData(resultado.validoAte.toISOString())}. ` +
            'Peça o novo à certificadora antes de continuar.',
        )
        return
      }

      // O CNPJ do certificado tem que ser o da oficina. Se for de outra
      // empresa, a Sefaz recusaria tudo depois — melhor recusar agora, com
      // o motivo na tela.
      const cnpjDaOficina = (oficina?.cnpj ?? '').replace(/\D/g, '')
      if (resultado.cnpj && cnpjDaOficina && resultado.cnpj !== cnpjDaOficina) {
        setErro(
          `Este certificado é do CNPJ ${formatarCnpj(resultado.cnpj)}, e a oficina está ` +
            `cadastrada como ${formatarCnpj(cnpjDaOficina)}. Confira se é o arquivo certo.`,
        )
        return
      }

      setLido(resultado)
    } catch (e) {
      setErro(
        e instanceof CertificadoInvalido
          ? e.message
          : 'Não consegui ler este arquivo. Ele precisa ser o .pfx que a certificadora entregou.',
      )
    } finally {
      setConferindo(false)
    }
  }

  async function registrar() {
    if (!lido || !oficina) return
    setSalvando(true)
    try {
      const { error } = await supabase
        .from('oficinas')
        .update({
          certificado_cnpj: lido.cnpj,
          certificado_titular: lido.titular,
          certificado_valido_ate: lido.validoAte.toISOString().slice(0, 10),
          certificado_configurado_em: new Date().toISOString(),
        })
        .eq('id', oficina.id)
      if (error) throw error

      await recarregarUsuario()
      // O arquivo e a senha morrem aqui, junto com o estado da tela.
      setArquivo(null)
      setSenha('')
      setLido(null)
      toast.sucesso('Certificado conferido e registrado.')
    } catch (e) {
      setErro(traduzirErro(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-card bg-superficie p-5 shadow-card">
      {jaConfigurado && diasRestantes !== null && (
        <div
          className={`flex items-start gap-3 rounded-controle px-4 py-3 ${
            diasRestantes < 0
              ? 'bg-erro-fundo'
              : diasRestantes <= DIAS_PARA_AVISAR
                ? 'bg-atencao-fundo'
                : 'bg-sucesso-fundo'
          }`}
        >
          {diasRestantes < 0 ? (
            <ShieldAlert aria-hidden size={20} className="mt-0.5 shrink-0 text-erro-forte" />
          ) : diasRestantes <= DIAS_PARA_AVISAR ? (
            <TriangleAlert aria-hidden size={20} className="mt-0.5 shrink-0 text-atencao-forte" />
          ) : (
            <ShieldCheck aria-hidden size={20} className="mt-0.5 shrink-0 text-sucesso-forte" />
          )}
          <div className="min-w-0">
            <p
              className={`text-corpo font-medium ${
                diasRestantes < 0
                  ? 'text-erro-forte'
                  : diasRestantes <= DIAS_PARA_AVISAR
                    ? 'text-atencao-forte'
                    : 'text-sucesso-forte'
              }`}
            >
              {diasRestantes < 0
                ? 'Certificado vencido'
                : diasRestantes <= DIAS_PARA_AVISAR
                  ? `Vence em ${diasRestantes} ${diasRestantes === 1 ? 'dia' : 'dias'}`
                  : 'Certificado configurado'}
            </p>
            <p className="text-apoio text-em-superficie-2">
              {oficina?.certificado_titular}
              {oficina?.certificado_cnpj ? ` · ${formatarCnpj(oficina.certificado_cnpj)}` : ''}
              {validoAte ? ` · vale até ${formatarData(validoAte)}` : ''}
            </p>
            {diasRestantes <= DIAS_PARA_AVISAR && (
              <p className="pt-1 text-apoio text-em-superficie-2">
                Peça o novo à certificadora e suba aqui. Depois que vence, as notas param de
                chegar.
              </p>
            )}
          </div>
        </div>
      )}

      <div>
        <p className="text-corpo text-em-superficie">
          {jaConfigurado ? 'Trocar o certificado' : 'Enviar o certificado A1'}
        </p>
        <p className="pt-1 text-apoio text-em-superficie-2">
          É o arquivo <strong>.pfx</strong> (ou .p12) que a certificadora entregou, junto com a
          senha dele. Conferimos aqui no seu aparelho — <strong>o arquivo não fica guardado
          no nosso sistema</strong>, só a validade, para avisar antes de vencer.
        </p>
      </div>

      <input
        ref={entrada}
        type="file"
        accept=".pfx,.p12,application/x-pkcs12"
        className="hidden"
        onChange={(e) => {
          const escolhido = e.target.files?.[0] ?? null
          setArquivo(escolhido)
          setLido(null)
          setErro(null)
          if (escolhido && senha) void conferir(escolhido, senha)
          e.target.value = ''
        }}
      />

      <button
        type="button"
        onClick={() => entrada.current?.click()}
        className="flex min-h-toque items-center justify-center gap-2 rounded-controle border border-borda-em-superficie px-4 text-em-superficie active:bg-fundo-2"
      >
        <Upload aria-hidden size={18} />
        <span className="text-corpo font-medium">
          {arquivo ? arquivo.name : 'Escolher arquivo do certificado'}
        </span>
      </button>

      <Campo
        rotulo="Senha do certificado"
        type="password"
        placeholder="A senha que veio com o arquivo"
        value={senha}
        onChange={(e) => {
          setSenha(e.target.value)
          setLido(null)
          setErro(null)
        }}
      />

      {arquivo && senha && !lido && !erro && (
        <Botao largo carregando={conferindo} onClick={() => void conferir(arquivo, senha)}>
          Conferir certificado
        </Botao>
      )}

      {lido && (
        <div className="flex flex-col gap-3 rounded-controle bg-sucesso-fundo px-4 py-3">
          <div className="flex items-start gap-2">
            <ShieldCheck aria-hidden size={20} className="mt-0.5 shrink-0 text-sucesso-forte" />
            <div className="min-w-0">
              <p className="text-corpo font-medium text-sucesso-forte">Certificado válido</p>
              <p className="text-apoio text-em-superficie-2">{lido.titular}</p>
              {lido.cnpj && (
                <p className="text-apoio text-em-superficie-2">{formatarCnpj(lido.cnpj)}</p>
              )}
              <p className="text-apoio text-em-superficie-2">
                Vale até {formatarData(lido.validoAte.toISOString())} ({lido.diasParaVencer} dias)
              </p>
            </div>
          </div>
          <Botao largo carregando={salvando} onClick={() => void registrar()}>
            Registrar certificado
          </Botao>
        </div>
      )}

      {erro && (
        <p role="alert" className="rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro-forte">
          {erro}
        </p>
      )}

      {/*
        O que ainda não existe, dito na tela em vez de escondido: sem o
        serviço fiscal contratado, o certificado é conferido e registrado,
        mas nada é buscado na Sefaz ainda.
      */}
      <p className="border-t border-borda-em-superficie pt-3 text-apoio text-em-superficie-2">
        A busca automática das notas dos fornecedores na Sefaz entra quando o serviço fiscal
        for ativado. Até lá, o certificado fica conferido e a validade acompanhada.
      </p>
    </div>
  )
}
