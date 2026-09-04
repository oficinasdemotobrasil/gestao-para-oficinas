import { useEffect, useState } from 'react'
import { Timer } from 'lucide-react'
import type { TempoDaOrdem } from './api'

/** 135 minutos vira "2h15". Na oficina ninguém conta em minutos acima de uma hora. */
export function duracao(minutos: number): string {
  const m = Math.max(0, Math.round(minutos))
  if (m < 60) return `${m} min`
  const horas = Math.floor(m / 60)
  const resto = m % 60
  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, '0')}`
}

/**
 * O tempo da ordem, somando todos os mecânicos que passaram por ela.
 *
 * Enquanto o relógio está ligado, o número anda na tela sem perguntar nada ao
 * servidor: o banco disse desde quando, e a conta do resto é aqui. Uma consulta
 * por segundo seria a mesma resposta paga muitas vezes — e no 3G da oficina,
 * uma tela travada.
 */
export function Cronometro({ tempo }: { tempo: TempoDaOrdem }) {
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    if (!tempo.rodando_desde) return
    const id = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [tempo.rodando_desde])

  const emAndamento = tempo.rodando_desde
    ? Math.max(0, (agora - new Date(tempo.rodando_desde).getTime()) / 60000)
    : 0
  const total = tempo.minutos_registrados + emAndamento

  const estimado = tempo.minutos_estimados
  const passou = estimado > 0 && total > estimado

  if (total === 0 && !tempo.rodando_desde && estimado === 0) return null

  return (
    <div className="flex items-center gap-3 rounded-card bg-superficie p-4 shadow-card">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          tempo.rodando_desde ? 'bg-acento' : 'bg-acento-suave'
        }`}
      >
        <Timer
          aria-hidden
          size={20}
          className={tempo.rodando_desde ? 'text-claro animate-pulse' : 'text-claro'}
        />
      </span>

      <div className="min-w-0">
        <p className="text-corpo font-medium text-claro">
          {tempo.rodando_desde ? duracao(total) : duracao(total)}
          {tempo.rodando_desde && (
            <span className="pl-2 text-apoio font-normal text-claro-secundario">
              rodando agora
            </span>
          )}
        </p>
        <p className="text-apoio text-claro-secundario">
          {estimado > 0 ? (
            <>
              Estimado {duracao(estimado)}
              {passou && (
                <span className="text-atencao"> · passou em {duracao(total - estimado)}</span>
              )}
            </>
          ) : tempo.quem_esta_com_ela ? (
            `Com ${tempo.quem_esta_com_ela}`
          ) : (
            'Tempo trabalhado nesta ordem'
          )}
        </p>
      </div>
    </div>
  )
}
