/**
 * A marca da oficina: o logo e a cor.
 *
 * Duas decisões que valem explicar, porque não são óbvias na tela:
 *
 * 1. A cor é medida antes de ser aceita. O acento aparece como fundo de botão
 *    com texto escuro por cima E como texto sobre o fundo escuro do app — uma
 *    cor pode servir para uma coisa e sumir na outra. Quando reprova, mostramos
 *    a mais próxima que passa, com o mesmo tom, em vez de só dizer não.
 *
 * 2. A imagem é reduzida aqui no navegador antes de subir. O arquivo que a
 *    oficina tem costuma ter megabytes; baixar isso em toda tela seria peso à
 *    toa numa internet ruim.
 */
import { useRef, useState } from 'react'
import { Botao } from '@/componentes/ui/Botao'
import { Campo } from '@/componentes/ui/Campo'
import { useToast } from '@/componentes/ui/Toast'
import { useAuth } from '@/auth/ProvedorAuth'
import { supabase } from '@/lib/supabase'
import { traduzirErro } from '@/lib/erros'
import {
  PALETA,
  COR_DO_PRODUTO,
  CONTRASTE_MINIMO,
  avaliarCor,
  corMaisProximaQuePassa,
  ehHexadecimal,
} from '@/lib/cor'
import { aplicarCorDaMarca } from '@/lib/marca'
import {
  conferirArquivo,
  reduzirLogo,
  MENSAGEM,
  TAMANHO_MAXIMO_EM_BYTES,
} from '@/lib/imagem'

/**
 * O logo não vai direto do navegador para o Storage: passa pela função `marca`.
 *
 * Assim a conferência de tipo e de tamanho acontece no servidor, onde quem
 * chama a API por fora não alcança — e o caminho do arquivo é escolhido lá, a
 * partir da oficina de quem pediu, em vez de vir daqui para ser conferido.
 */
async function paraBase64(blob: Blob): Promise<string> {
  const leitor = new FileReader()
  const dados = await new Promise<string>((aceitar, recusar) => {
    leitor.onload = () => aceitar(String(leitor.result))
    leitor.onerror = () => recusar(new Error('Não consegui ler a imagem.'))
    leitor.readAsDataURL(blob)
  })
  return dados.split(',')[1]
}

export function Marca() {
  const { oficina, recarregarUsuario } = useAuth()
  const toast = useToast()
  const entradaArquivo = useRef<HTMLInputElement>(null)

  const [enviando, setEnviando] = useState(false)
  const [salvandoCor, setSalvandoCor] = useState(false)
  const [corDigitada, setCorDigitada] = useState('')
  const [sugestao, setSugestao] = useState<string | null>(null)
  const [avisoDeCor, setAvisoDeCor] = useState('')

  if (!oficina) return null

  const corAtual = oficina.cor_primaria ?? COR_DO_PRODUTO

  async function gravarCor(cor: string) {
    setSalvandoCor(true)
    try {
      const { error } = await supabase
        .from('oficinas')
        .update({ cor_primaria: cor.toLowerCase() })
        .eq('id', oficina!.id)
      if (error) throw error
      // Pinta antes de recarregar: a resposta é imediata, sem esperar a volta.
      aplicarCorDaMarca(cor)
      await recarregarUsuario()
      setSugestao(null)
      setAvisoDeCor('')
      toast.sucesso('Cor da marca atualizada.')
    } catch (e) {
      toast.erro(traduzirErro(e))
    } finally {
      setSalvandoCor(false)
    }
  }

  function tentarCorDigitada(bruta: string) {
    const cor = bruta.trim().toLowerCase()
    setCorDigitada(cor)
    setSugestao(null)
    setAvisoDeCor('')
    if (!ehHexadecimal(cor)) return
    const avaliacao = avaliarCor(cor)
    if (avaliacao.aprovada) {
      void gravarCor(cor)
      return
    }
    const proxima = corMaisProximaQuePassa(cor)
    setSugestao(proxima)
    setAvisoDeCor(
      proxima
        ? 'Essa cor deixa o texto difícil de ler. Sugerimos esta.'
        : 'Essa cor deixa o texto difícil de ler e não encontrei uma parecida que funcione.',
    )
  }

  async function enviarLogo(arquivo: File) {
    const problema = conferirArquivo(arquivo)
    if (problema) {
      toast.erro(MENSAGEM[problema])
      return
    }

    setEnviando(true)
    try {
      const { grande, miniatura } = await reduzirLogo(arquivo)
      const { data, error } = await supabase.functions.invoke('marca', {
        body: {
          acao: 'salvar',
          grande: await paraBase64(grande),
          miniatura: await paraBase64(miniatura),
        },
      })
      if (error) throw error
      if (data?.erro) throw new Error(data.erro)

      await recarregarUsuario()
      toast.sucesso('Logo atualizado.')
    } catch (e) {
      toast.erro(traduzirErro(e))
    } finally {
      setEnviando(false)
      if (entradaArquivo.current) entradaArquivo.current.value = ''
    }
  }

  async function removerLogo() {
    setEnviando(true)
    try {
      const { data, error } = await supabase.functions.invoke('marca', {
        body: { acao: 'remover' },
      })
      if (error) throw error
      if (data?.erro) throw new Error(data.erro)
      await recarregarUsuario()
      toast.sucesso('Logo removido.')
    } catch (e) {
      toast.erro(traduzirErro(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Logo ------------------------------------------------------------- */}
      <div className="rounded-card bg-superficie p-4 tablet:p-6">
        <div className="flex flex-col gap-4 tablet:flex-row tablet:items-center">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-controle border border-borda-em-superficie bg-fundo">
            {oficina.logo_miniatura_url ? (
              <img
                src={oficina.logo_miniatura_url}
                alt={`Logo de ${oficina.nome}`}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="text-titulo font-bold text-acento-forte">
                {oficina.nome.trim().charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-corpo text-em-superficie">
              Aparece no menu, no cabeçalho do PDF de orçamento e de ordem de
              serviço, e na tela de entrar deste aparelho.
            </p>
            <p className="pt-1 text-apoio text-em-superficie-2">
              PNG ou JPG, até {Math.round(TAMANHO_MAXIMO_EM_BYTES / 1024 / 1024)} MB.
              A imagem é reduzida aqui antes de subir.
            </p>

            <div className="flex flex-wrap gap-3 pt-4">
              <input
                ref={entradaArquivo}
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                onChange={(e) => {
                  const arquivo = e.target.files?.[0]
                  if (arquivo) void enviarLogo(arquivo)
                }}
              />
              <Botao
                type="button"
                variante="contorno-no-card"
                compactoNoDesktop
                carregando={enviando}
                onClick={() => entradaArquivo.current?.click()}
              >
                {oficina.logo_miniatura_url ? 'Trocar logo' : 'Escolher logo'}
              </Botao>
              {oficina.logo_miniatura_url && (
                <Botao
                  type="button"
                  variante="contorno-no-card"
                  compactoNoDesktop
                  disabled={enviando}
                  onClick={() => void removerLogo()}
                >
                  Remover
                </Botao>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cor -------------------------------------------------------------- */}
      <div className="rounded-card bg-superficie p-4 tablet:p-6">
        <p className="text-corpo text-em-superficie">
          A cor entra nos destaques: botão principal, item ativo do menu e
          números em evidência. O resto do app continua igual, porque é ele que
          garante a leitura.
        </p>

        <div className="grid grid-cols-4 gap-3 pt-4 tablet:grid-cols-8">
          {PALETA.map(({ nome, hex }) => {
            const escolhida = hex === corAtual
            return (
              <button
                key={hex}
                type="button"
                title={nome}
                aria-label={nome}
                aria-pressed={escolhida}
                disabled={salvandoCor}
                onClick={() => void gravarCor(hex)}
                className={[
                  'flex h-12 items-center justify-center rounded-controle border-2 transition-transform',
                  escolhida ? 'border-em-superficie scale-105' : 'border-transparent hover:scale-105',
                ].join(' ')}
                style={{ backgroundColor: hex }}
              >
                {escolhida && (
                  <span className="text-rotulo font-bold text-em-superficie">✓</span>
                )}
              </button>
            )
          })}
        </div>

        <div className="pt-6">
          <p className="pb-2 text-rotulo text-em-superficie">Outra cor</p>
          <div className="flex flex-wrap items-end gap-3">
            <input
              type="color"
              aria-label="Escolher outra cor"
              value={ehHexadecimal(corDigitada) ? corDigitada : corAtual}
              onChange={(e) => tentarCorDigitada(e.target.value)}
              className="h-12 w-16 cursor-pointer rounded-controle border border-borda-em-superficie bg-superficie p-1"
            />
            <div className="min-w-[10rem] flex-1">
              <Campo
                rotulo="Código da cor"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="#f5c518"
                value={corDigitada}
                onChange={(e) => tentarCorDigitada(e.target.value)}
              />
            </div>
          </div>

          {avisoDeCor && (
            <div
              role="alert"
              className="mt-3 rounded-controle bg-atencao-fundo px-4 py-3 text-corpo text-em-superficie"
            >
              <p>{avisoDeCor}</p>
              {sugestao && (
                <div className="flex flex-wrap items-center gap-3 pt-3">
                  <span
                    aria-hidden
                    className="h-9 w-9 rounded-controle border border-borda-em-superficie"
                    style={{ backgroundColor: sugestao }}
                  />
                  <span className="text-rotulo text-em-superficie-2">{sugestao}</span>
                  <Botao
                    type="button"
                    variante="contorno-no-card"
                    compactoNoDesktop
                    carregando={salvandoCor}
                    onClick={() => void gravarCor(sugestao)}
                  >
                    Usar esta
                  </Botao>
                </div>
              )}
            </div>
          )}

          <p className="pt-3 text-apoio text-em-superficie-2">
            Toda cor é medida contra o texto que fica por cima dela e contra o
            fundo escuro do app. O mínimo é {CONTRASTE_MINIMO.toString().replace('.', ',')}:1,
            a régua das normas de acessibilidade.
          </p>
        </div>
      </div>
    </div>
  )
}
