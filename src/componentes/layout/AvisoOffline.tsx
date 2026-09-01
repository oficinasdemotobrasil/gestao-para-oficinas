import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

/** Acompanha o sinal de internet do aparelho. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const entrou = () => setOnline(true)
    const caiu = () => setOnline(false)
    window.addEventListener('online', entrou)
    window.addEventListener('offline', caiu)
    return () => {
      window.removeEventListener('online', entrou)
      window.removeEventListener('offline', caiu)
    }
  }, [])

  return online
}

/**
 * Faixa fixa no topo quando o sinal cai. O app abre offline (o shell está em
 * cache), mas os dados vêm do servidor — então é honesto avisar em vez de
 * mostrar tela vazia e deixar a pessoa achando que perdeu o cadastro.
 */
export function AvisoOffline() {
  const online = useOnline()
  if (online) return null

  return (
    <div
      role="status"
      className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-atencao px-4 py-2 text-claro"
    >
      <WifiOff aria-hidden size={16} />
      <span className="text-apoio font-medium">
        Você está sem conexão. Os dados podem estar desatualizados.
      </span>
    </div>
  )
}
