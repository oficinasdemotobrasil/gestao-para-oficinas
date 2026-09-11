/**
 * Claro, escuro, ou o que o aparelho pedir.
 *
 * Fica no aparelho, e não na oficina: a mesma oficina tem o celular do mecânico
 * no bolso e o computador do balcão embaixo da luz do teto. Guardar no banco
 * obrigaria os dois a concordarem, e eles não concordam.
 */
import { useState } from 'react'
import { Moon, Sun, SunMoon } from 'lucide-react'
import { aplicarTema, temaEscolhido, type Tema } from '@/lib/tema'
import { aplicarCorDaMarca } from '@/lib/marca'
import { useAuth } from '@/auth/ProvedorAuth'

const OPCOES: { valor: Tema; rotulo: string; Icone: typeof Sun }[] = [
  { valor: 'automatico', rotulo: 'Do aparelho', Icone: SunMoon },
  { valor: 'claro', rotulo: 'Claro', Icone: Sun },
  { valor: 'escuro', rotulo: 'Escuro', Icone: Moon },
]

export function Aparencia() {
  const { oficina } = useAuth()
  const [tema, setTema] = useState<Tema>(() => temaEscolhido())

  function escolher(novo: Tema) {
    setTema(novo)
    aplicarTema(novo)
    // A cor da marca tem uma versão para cada tema — a do botão e a do texto.
    // Sem reaplicar, o destaque ficaria na versão do tema anterior.
    aplicarCorDaMarca(oficina?.cor_primaria)
  }

  return (
    <div className="rounded-card bg-superficie p-4 tablet:p-6">
      <p className="text-corpo text-em-superficie">Como você prefere ver o app</p>
      <p className="pt-1 text-apoio text-em-superficie-2">
        Vale só neste aparelho. O celular do mecânico e o computador do balcão
        podem ficar diferentes — e quase sempre ficam.
      </p>

      <div
        role="radiogroup"
        aria-label="Aparência"
        className="grid grid-cols-3 gap-3 pt-4"
      >
        {OPCOES.map(({ valor, rotulo, Icone }) => {
          const marcado = tema === valor
          return (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={marcado}
              onClick={() => escolher(valor)}
              className={[
                'flex min-h-toque flex-col items-center justify-center gap-1 rounded-controle border p-3',
                marcado
                  ? 'border-acento bg-acento-suave'
                  : 'border-borda-em-superficie active:bg-borda-em-superficie/40',
              ].join(' ')}
            >
              <Icone aria-hidden size={20} className="text-em-superficie" />
              <span className="text-apoio text-em-superficie">{rotulo}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
