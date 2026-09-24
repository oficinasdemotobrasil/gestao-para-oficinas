/**
 * O percentual de comissão que vale para todo indicador da oficina.
 *
 * É o padrão, não a regra fechada: cada indicador pode ter o seu, e o dele
 * vence este (0065). Sem essa distinção, dar 15% a um parceiro que traz muito
 * serviço obrigaria a mudar o de todo mundo.
 *
 * Mudar aqui NÃO mexe nas comissões já geradas: elas guardam o percentual do
 * dia em que o orçamento foi aprovado. O que foi combinado com o parceiro
 * naquele serviço não muda porque a tabela mudou depois.
 */
import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Campo } from '@/componentes/ui/Campo'
import { Botao } from '@/componentes/ui/Botao'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { paraNumero } from '@/lib/numero'
import { useAuth } from '@/auth/ProvedorAuth'
import { supabase } from '@/lib/supabase'

export function ComissaoPadrao() {
  const { oficina, recarregarUsuario } = useAuth()
  const toast = useToast()
  const [percentual, setPercentual] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (oficina) setPercentual(String(oficina.comissao_indicador_percentual).replace('.', ','))
  }, [oficina])

  const salvar = useMutation({
    mutationFn: async () => {
      const valor = paraNumero(percentual)
      if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
        throw new Error('O percentual vai de 0 a 100.')
      }
      const { error } = await supabase
        .from('oficinas')
        .update({ comissao_indicador_percentual: valor })
        .eq('id', oficina!.id)
      if (error) throw error
      await recarregarUsuario()
    },
    onSuccess: () => {
      setErro(null)
      toast.sucesso('Comissão padrão salva.')
    },
    onError: (e) => setErro(traduzirErro(e)),
  })

  return (
    <div className="flex flex-col gap-4 rounded-card bg-superficie p-5 shadow-card">
      <Campo
        rotulo="Comissão padrão do indicador"
        inputMode="decimal"
        placeholder="10"
        dica="Em porcento do valor do orçamento aprovado. Cada indicador pode ter o seu."
        value={percentual}
        onChange={(e) => setPercentual(e.target.value)}
      />

      <p className="text-apoio text-em-superficie-2">
        Mudar aqui não mexe nas comissões já geradas: cada uma guarda o percentual do dia em que
        o orçamento foi aprovado.
      </p>

      {erro && (
        <p role="alert" className="rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro-forte">
          {erro}
        </p>
      )}

      <Botao largo carregando={salvar.isPending} onClick={() => salvar.mutate()}>
        Salvar comissão padrão
      </Botao>
    </div>
  )
}
