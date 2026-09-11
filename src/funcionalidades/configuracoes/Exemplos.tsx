/**
 * O catálogo de exemplo: carregar e apagar.
 *
 * Existe para a oficina ver o sistema funcionando antes de digitar qualquer
 * coisa. Tela vazia não ensina nada — com doze peças e oito serviços dentro,
 * dá para fazer um orçamento de mentira e entender o fluxo em dois minutos.
 *
 * Duas decisões que a tela precisa deixar claras, porque surpreendem:
 *
 * 1. Exemplo NÃO conta como primeiro passo. O passo é cadastrar o seu.
 * 2. O que já foi usado num orçamento ou entrou no estoque não é apagado —
 *    naquele momento deixou de ser exemplo e virou histórico de verdade.
 */
import { useState } from 'react'
import { PackagePlus, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Botao } from '@/componentes/ui/Botao'
import { useToast } from '@/componentes/ui/Toast'
import { supabase } from '@/lib/supabase'
import { traduzirErro } from '@/lib/erros'

export function Exemplos() {
  const toast = useToast()
  const fila = useQueryClient()
  const [carregando, setCarregando] = useState(false)
  const [apagando, setApagando] = useState(false)

  async function depois() {
    await Promise.all([
      fila.invalidateQueries({ queryKey: ['produtos'] }),
      fila.invalidateQueries({ queryKey: ['servicos'] }),
      fila.invalidateQueries({ queryKey: ['primeiros-passos'] }),
    ])
  }

  async function carregar() {
    setCarregando(true)
    try {
      const { data, error } = await supabase.rpc('carregar_exemplos')
      if (error) throw error
      const r = data as unknown as { servicos: number; produtos: number }
      await depois()
      toast.sucesso(
        r.servicos + r.produtos === 0
          ? 'Os exemplos já estavam carregados.'
          : `${r.servicos} serviços e ${r.produtos} peças de exemplo entraram.`,
      )
    } catch (e) {
      toast.erro(traduzirErro(e))
    } finally {
      setCarregando(false)
    }
  }

  async function apagar() {
    setApagando(true)
    try {
      const { data, error } = await supabase.rpc('apagar_exemplos')
      if (error) throw error
      const r = data as unknown as {
        servicos: number
        produtos: number
        mantidos_por_uso: number
      }
      await depois()
      const saiu = r.servicos + r.produtos
      toast.sucesso(
        r.mantidos_por_uso > 0
          ? `${saiu} exemplos apagados. ${r.mantidos_por_uso} ficaram porque já foram usados em algum atendimento.`
          : `${saiu} exemplos apagados.`,
      )
    } catch (e) {
      toast.erro(traduzirErro(e))
    } finally {
      setApagando(false)
    }
  }

  return (
    <div className="rounded-card bg-superficie p-4 tablet:p-6">
      <p className="text-corpo text-em-superficie">
        Comece com um catálogo pronto para experimentar.
      </p>
      <p className="pt-1 text-apoio text-em-superficie-2">
        Oito serviços e doze peças comuns de oficina de moto, com preços de
        referência para você trocar pelos seus. Serve para fazer um orçamento de
        teste e entender o sistema sem digitar nada.
      </p>
      <p className="pt-2 text-apoio text-em-superficie-2">
        Eles não contam como “cadastrei meu primeiro serviço” — esse passo é o
        seu. E o que já tiver sido usado num orçamento ou entrado no estoque não
        é apagado: virou histórico de verdade.
      </p>

      <div className="flex flex-wrap gap-3 pt-4">
        <Botao
          type="button"
          variante="contorno-no-card"
          compactoNoDesktop
          carregando={carregando}
          icone={<PackagePlus aria-hidden size={18} />}
          onClick={() => void carregar()}
        >
          Carregar exemplos
        </Botao>
        <Botao
          type="button"
          variante="contorno-no-card"
          compactoNoDesktop
          carregando={apagando}
          icone={<Trash2 aria-hidden size={18} />}
          onClick={() => void apagar()}
        >
          Apagar os exemplos
        </Botao>
      </div>
    </div>
  )
}
