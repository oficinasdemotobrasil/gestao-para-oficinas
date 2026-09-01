import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/cn'

type Tom = 'sucesso' | 'erro' | 'aviso'

interface Aviso {
  id: number
  texto: string
  tom: Tom
}

interface Contexto {
  sucesso: (texto: string) => void
  erro: (texto: string) => void
  aviso: (texto: string) => void
}

const ToastContexto = createContext<Contexto | null>(null)

const tons: Record<Tom, { classe: string; Icone: typeof Info }> = {
  sucesso: { classe: 'bg-sucesso-fundo text-sucesso', Icone: CheckCircle2 },
  erro: { classe: 'bg-erro-fundo text-erro', Icone: AlertTriangle },
  aviso: { classe: 'bg-atencao-fundo text-atencao', Icone: Info },
}

export function ProvedorToast({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])

  const mostrar = useCallback((texto: string, tom: Tom) => {
    const id = Date.now() + Math.random()
    setAvisos((atuais) => [...atuais, { id, texto, tom }])
    // Some sozinho: dentro da oficina ninguém para para fechar aviso.
    setTimeout(() => {
      setAvisos((atuais) => atuais.filter((a) => a.id !== id))
    }, 4000)
  }, [])

  const valor = useMemo<Contexto>(
    () => ({
      sucesso: (t) => mostrar(t, 'sucesso'),
      erro: (t) => mostrar(t, 'erro'),
      aviso: (t) => mostrar(t, 'aviso'),
    }),
    [mostrar],
  )

  return (
    <ToastContexto.Provider value={valor}>
      {children}
      {/* Acima da tab bar, para não cobrir a navegação. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--altura-tabbar)+16px+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-5"
      >
        {avisos.map(({ id, texto, tom }) => {
          const { classe, Icone } = tons[tom]
          return (
            <div
              key={id}
              className={cn(
                'flex w-full max-w-md items-center gap-3 rounded-controle px-4 py-3 shadow-flutuante',
                classe,
              )}
            >
              <Icone aria-hidden size={20} className="shrink-0" />
              <span className="text-corpo font-medium">{texto}</span>
            </div>
          )
        })}
      </div>
    </ToastContexto.Provider>
  )
}

export function useToast(): Contexto {
  const contexto = useContext(ToastContexto)
  if (!contexto) {
    throw new Error('useToast precisa estar dentro de <ProvedorToast>.')
  }
  return contexto
}
