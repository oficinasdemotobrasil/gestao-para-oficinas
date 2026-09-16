import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Campo } from '@/componentes/ui/Campo'

/**
 * Os campos que o contador vai usar quando a nota virar NFe/NFSe de verdade.
 * Recolhidos por padrão — igual "Validade, garantia e observações" no
 * orçamento — porque no dia a dia a maioria das notas não preenche nada
 * disso, e uma tela cheia de campo fiscal na primeira vez assusta mais do
 * que ajuda. Quem precisa abre; quem não precisa nem vê.
 */
export interface DadosFiscais {
  natureza_operacao: string
  cfop: string
  base_calculo_icms: string
  valor_icms: string
  base_calculo_iss: string
  valor_iss: string
}

export const fiscalVazio: DadosFiscais = {
  natureza_operacao: '',
  cfop: '',
  base_calculo_icms: '',
  valor_icms: '',
  base_calculo_iss: '',
  valor_iss: '',
}

interface Props {
  dados: DadosFiscais
  aoMudar: (dados: DadosFiscais) => void
  /** A entrada raramente tem ISS (é ICMS que se aplica); a saída pode ter os dois. */
  comIss?: boolean
  erros?: Partial<Record<keyof DadosFiscais, string>>
}

export function CamposFiscais({ dados, aoMudar, comIss = true, erros }: Props) {
  const [aberto, setAberto] = useState(false)
  const campo = (chave: keyof DadosFiscais) => (v: string) => aoMudar({ ...dados, [chave]: v })

  return (
    <div>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex min-h-toque w-full items-center justify-between gap-3 rounded-controle border border-borda-em-fundo px-4 text-em-fundo"
      >
        <span className="text-corpo font-medium">Dados fiscais</span>
        {aberto ? <ChevronUp aria-hidden size={20} /> : <ChevronDown aria-hidden size={20} />}
      </button>

      {aberto && (
        <div className="mt-3 flex flex-col gap-4 rounded-card bg-superficie p-5 shadow-card">
          <p className="text-apoio text-em-superficie-2">
            Opcional. Preencha o que já sabe — o contador completa o resto quando a
            nota virar documento fiscal de verdade.
          </p>

          <Campo
            rotulo="Natureza da operação"
            placeholder="Compra para comercialização"
            value={dados.natureza_operacao}
            onChange={(e) => campo('natureza_operacao')(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Campo
              rotulo="CFOP"
              inputMode="numeric"
              placeholder="5102"
              erro={erros?.cfop}
              value={dados.cfop}
              onChange={(e) => campo('cfop')(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo
              rotulo="Base de cálculo do ICMS"
              inputMode="decimal"
              placeholder="250,00"
              erro={erros?.base_calculo_icms}
              value={dados.base_calculo_icms}
              onChange={(e) => campo('base_calculo_icms')(e.target.value)}
            />
            <Campo
              rotulo="Valor do ICMS"
              inputMode="decimal"
              placeholder="45,00"
              erro={erros?.valor_icms}
              value={dados.valor_icms}
              onChange={(e) => campo('valor_icms')(e.target.value)}
            />
          </div>

          {comIss && (
            <div className="grid grid-cols-2 gap-3">
              <Campo
                rotulo="Base de cálculo do ISS"
                inputMode="decimal"
                placeholder="200,00"
                erro={erros?.base_calculo_iss}
                value={dados.base_calculo_iss}
                onChange={(e) => campo('base_calculo_iss')(e.target.value)}
              />
              <Campo
                rotulo="Valor do ISS"
                inputMode="decimal"
                placeholder="12,00"
                erro={erros?.valor_iss}
                value={dados.valor_iss}
                onChange={(e) => campo('valor_iss')(e.target.value)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
