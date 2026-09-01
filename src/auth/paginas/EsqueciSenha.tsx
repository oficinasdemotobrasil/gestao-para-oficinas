import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { MailCheck } from 'lucide-react'
import { Botao } from '@/componentes/ui/Botao'
import { Campo } from '@/componentes/ui/Campo'
import { useAuth } from '@/auth/ProvedorAuth'
import { esquemaEsqueciSenha, type DadosEsqueciSenha } from '@/auth/esquemas'

export function EsqueciSenha() {
  const { enviarRecuperacao } = useAuth()
  const [enviado, setEnviado] = useState(false)
  const [erroGeral, setErroGeral] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<DadosEsqueciSenha>({ resolver: zodResolver(esquemaEsqueciSenha) })

  async function aoEnviar(dados: DadosEsqueciSenha) {
    setErroGeral(null)
    try {
      await enviarRecuperacao(dados.email)
      setEnviado(true)
    } catch (e) {
      setErroGeral((e as Error).message)
    }
  }

  if (enviado) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10 text-center">
        <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-acento">
          <MailCheck aria-hidden size={30} className="text-claro" />
        </span>
        <h1 className="text-titulo text-escuro">Verifique seu e-mail</h1>
        <p className="mx-auto max-w-[38ch] pt-2 text-corpo text-escuro-secundario">
          Se existir uma conta para {getValues('email')}, o link para criar uma
          nova senha chega em instantes. Ele vale por uma hora.
        </p>
        <Link to="/entrar" className="pt-8">
          <Botao variante="contorno" largo>
            Voltar para o login
          </Botao>
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10">
      <div className="pb-6">
        <h1 className="text-titulo text-escuro">Esqueci minha senha</h1>
        <p className="pt-1 text-corpo text-escuro-secundario">
          Informe o e-mail do seu acesso. Enviamos um link para você criar uma
          nova senha.
        </p>
      </div>

      <form
        onSubmit={handleSubmit(aoEnviar)}
        noValidate
        className="flex flex-col gap-4 rounded-card bg-superficie p-6 shadow-card"
      >
        <Campo
          rotulo="E-mail"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="voce@oficina.com.br"
          erro={errors.email?.message}
          {...register('email')}
        />

        {erroGeral && (
          <p role="alert" className="rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro">
            {erroGeral}
          </p>
        )}

        <Botao type="submit" largo carregando={isSubmitting} className="mt-2">
          Enviar link
        </Botao>
      </form>

      <Link
        to="/entrar"
        className="flex min-h-toque items-center justify-center pt-4 text-corpo text-acento"
      >
        Voltar para o login
      </Link>
    </main>
  )
}
