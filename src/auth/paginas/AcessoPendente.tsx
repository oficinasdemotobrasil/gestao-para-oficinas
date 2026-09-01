import { UserX } from 'lucide-react'
import { Botao } from '@/componentes/ui/Botao'
import { useAuth } from '@/auth/ProvedorAuth'

/**
 * Sessão válida no Auth, mas sem cadastro em public.usuarios — acontece quando
 * o usuário foi criado no painel do Supabase e ninguém rodou o vínculo com a
 * oficina. Sem esta tela a pessoa cairia num app vazio sem entender por quê.
 */
export function AcessoPendente() {
  const { sair, sessao } = useAuth()

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-superficie-escura text-acento">
        <UserX aria-hidden size={30} />
      </span>
      <h1 className="text-titulo text-escuro">Acesso ainda não liberado</h1>
      <p className="max-w-[38ch] text-corpo text-escuro-secundario">
        Seu login funciona, mas {sessao?.user.email} ainda não está vinculado a
        nenhuma oficina. Peça ao responsável para liberar seu acesso.
      </p>
      <Botao variante="contorno" onClick={sair} className="mt-4">
        Sair
      </Botao>
    </main>
  )
}
