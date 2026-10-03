import { useEffect, useState } from 'react'

/**
 * Ler um texto em voz alta com a voz do próprio aparelho.
 *
 * Para a ajuda: na oficina, a pessoa está com a mão suja, o celular apoiado
 * na bancada e a moto na frente. Ouvir o passo a passo enquanto faz é mais
 * útil do que ler. A voz é a do sistema (Android, iPhone, computador) — não
 * custa nada, não usa internet e não manda o texto para lugar nenhum.
 *
 * Uma leitura por vez no app inteiro: tocar em "Ouvir" noutro guia para a
 * leitura anterior, em vez de as duas falarem juntas.
 */

const suportado = typeof window !== 'undefined' && 'speechSynthesis' in window

let falandoAgora: string | null = null
const ouvintes = new Set<(id: string | null) => void>()

function avisar(id: string | null) {
  falandoAgora = id
  ouvintes.forEach((o) => o(id))
}

/** A voz em português do Brasil, se o aparelho tiver; senão, qualquer português. */
function vozBrasileira(): SpeechSynthesisVoice | null {
  const vozes = window.speechSynthesis.getVoices()
  return (
    vozes.find((v) => v.lang === 'pt-BR' && v.localService) ??
    vozes.find((v) => v.lang === 'pt-BR') ??
    vozes.find((v) => v.lang.replace('_', '-').toLowerCase().startsWith('pt-br')) ??
    vozes.find((v) => v.lang.toLowerCase().startsWith('pt')) ??
    null
  )
}

/**
 * O texto escrito para os olhos nem sempre soa bem: a seta vira "seta", as
 * aspas são lidas em alguns aparelhos. Troca o que atrapalha o ouvido.
 */
function paraOuvir(texto: string): string {
  return texto
    .replace(/\s*→\s*/g, ', depois, ')
    .replace(/["“”]/g, '')
    .replace(/\s+—\s+/g, ', ')
    .replace(/\bOS\b/g, 'O.S.')
}

export function pararDeFalar() {
  if (!suportado) return
  window.speechSynthesis.cancel()
  avisar(null)
}

export function falar(id: string, trechos: string[]) {
  if (!suportado) return
  window.speechSynthesis.cancel()

  const voz = vozBrasileira()
  // Um trecho por frase, e não o texto inteiro de uma vez: o Chrome corta
  // falas longas no meio, e entre um passo e outro sobra uma pausa natural.
  const falas = trechos.map((t) => {
    const fala = new SpeechSynthesisUtterance(paraOuvir(t))
    fala.lang = 'pt-BR'
    if (voz) fala.voice = voz
    fala.rate = 0.95
    return fala
  })
  if (falas.length === 0) return

  const ultima = falas[falas.length - 1]
  ultima.onend = () => {
    if (falandoAgora === id) avisar(null)
  }
  falas.forEach((f) => {
    f.onerror = () => {
      if (falandoAgora === id) avisar(null)
    }
    window.speechSynthesis.speak(f)
  })
  avisar(id)
}

/** Qual leitura está tocando agora, para o botão virar "Parar". */
export function useLeitura() {
  const [id, setId] = useState<string | null>(falandoAgora)

  useEffect(() => {
    ouvintes.add(setId)
    // As vozes chegam depois de a página abrir em alguns navegadores; pedir
    // a lista uma vez faz elas estarem prontas no primeiro toque.
    if (suportado) window.speechSynthesis.getVoices()
    return () => {
      ouvintes.delete(setId)
      // Saiu da ajuda no meio da leitura: para de falar.
      if (ouvintes.size === 0) pararDeFalar()
    }
  }, [])

  return { suportado, falando: id }
}
