import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A internet da oficina cai e volta. Uma tentativa a mais resolve a
      // maioria dos casos; mais que isso só deixa a tela travada por mais tempo.
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Sem sinal, falha rápido e mostra o aviso em vez de girar para sempre.
      networkMode: 'online',
    },
    mutations: {
      retry: 0,
      networkMode: 'online',
    },
  },
})
