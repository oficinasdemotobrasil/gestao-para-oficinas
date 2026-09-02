import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { ehSessaoExpirada } from './erros'

/**
 * Quando o token vence, não adianta tentar de novo: toda chamada seguinte falha
 * igual. Derrubamos a sessão de uma vez, o que leva a pessoa para a tela de
 * login em vez de deixá-la apertando "salvar" num formulário que nunca grava.
 */
async function tratarSessaoExpirada(erro: unknown) {
  if (!ehSessaoExpirada(erro)) return
  await supabase.auth.signOut().catch(() => undefined)
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (erro) => void tratarSessaoExpirada(erro) }),
  mutationCache: new MutationCache({ onError: (erro) => void tratarSessaoExpirada(erro) }),
  defaultOptions: {
    queries: {
      // A internet da oficina cai e volta. Uma tentativa a mais resolve a
      // maioria dos casos; mais que isso só deixa a tela travada por mais tempo.
      // Sessão vencida não se resolve tentando de novo.
      retry: (tentativas, erro) => !ehSessaoExpirada(erro) && tentativas < 1,
      staleTime: 30_000,
      // O celular fica no bolso e volta. Ao voltar, os dados na tela podem ter
      // uma hora — melhor buscar de novo do que mostrar estoque que já mudou.
      refetchOnWindowFocus: true,
      // Sem sinal, falha rápido e mostra o aviso em vez de girar para sempre.
      networkMode: 'online',
    },
    mutations: {
      retry: 0,
      networkMode: 'online',
    },
  },
})
