import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/tipos/banco'

const url = import.meta.env.VITE_SUPABASE_URL
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !chave || url.includes('TROQUE')) {
  throw new Error(
    'Faltam as chaves do Supabase. Copie .env.local.example para .env.local e preencha ' +
      'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY com os dados do painel.',
  )
}

/**
 * Cliente único do app. Usa exclusivamente a publishable key (anon).
 * A service_role NUNCA entra aqui: ela ignora o RLS e, no navegador, daria a
 * qualquer usuário acesso aos dados de todas as oficinas.
 */
export const supabase = createClient<Database>(url, chave, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // A oficina usa um celular só, com o app instalado: a sessão precisa
    // sobreviver a fechar e reabrir o app.
    storageKey: 'oficinas.sessao',
  },
})
