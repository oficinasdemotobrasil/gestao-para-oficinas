import { useEffect, useState } from 'react'

/**
 * Segura o valor por alguns instantes antes de deixar a busca ir ao servidor.
 * Na internet da oficina, disparar uma consulta por tecla digitada deixa a lista
 * piscando e gasta banda à toa.
 */
export function useDebounce<T>(valor: T, espera = 300): T {
  const [atrasado, setAtrasado] = useState(valor)

  useEffect(() => {
    const id = setTimeout(() => setAtrasado(valor), espera)
    return () => clearTimeout(id)
  }, [valor, espera])

  return atrasado
}
