import { UserX } from 'lucide-react'
import { Botao } from '@/componentes/ui/Botao'
import { useAuth } from '@/auth/ProvedorAuth'
import { MolduraDeEntrada } from '@/auth/MolduraDeEntrada'

/**
 * Sessão válida no Auth, mas sem cadastro em public.usuarios — acontece quando
 * o usuário foi criado no painel do Supabase e ninguém rodou o vínculo com a
 * oficina. Sem esta tela a pessoa cairia num app vazio sem entender por quê.
 */
export function AcessoPendente() {
  const { sair, sessao } = useAuth()

  return (
    <MolduraDeEntrada>
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-fundo-2 text-acento-forte">
        <UserX aria-hidden size={30} />
      </span>
      <h1 className="text-titulo text-em-fundo">Acesso ainda não liberado</h1>
      <p className="max-w-[38ch] text-corpo text-em-fundo-2">
        Seu login funciona, mas {sessao?.user.email} ainda não está vinculado a nenhuma oficina.
        Peça ao responsável para liberar seu acesso.
      </p>
      <Botao variante="contorno" onClick={sair} className="mt-4">
        Sair
      </Botao>
    </MolduraDeEntrada>
  )
}
