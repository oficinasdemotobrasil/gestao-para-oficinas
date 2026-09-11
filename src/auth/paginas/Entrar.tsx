import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Wrench, Eye, EyeOff } from 'lucide-react'
import { marcaLembrada } from '@/lib/marca'
import { Botao } from '@/componentes/ui/Botao'
import { Campo } from '@/componentes/ui/Campo'
import { useAuth } from '@/auth/ProvedorAuth'
import { esquemaEntrar, type DadosEntrar } from '@/auth/esquemas'

export function Entrar() {
  const { entrar } = useAuth()
  const navegar = useNavigate()
  const local = useLocation() as { state?: { de?: string } }
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [mostrarSenha, setMostrarSenha] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DadosEntrar>({ resolver: zodResolver(esquemaEntrar) })

  async function aoEnviar(dados: DadosEntrar) {
    setErroGeral(null)
    try {
      await entrar(dados.email, dados.senha)
      navegar(local.state?.de ?? '/', { replace: true })
    } catch (e) {
      setErroGeral((e as Error).message)
    }
  }

  const marca = marcaLembrada()

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10">
      {/* A oficina que entrou por último neste aparelho. O app tem um endereço
          só e ainda não sabe quem está digitando — mas o computador do balcão é
          sempre da mesma oficina, então da segunda vez em diante ele já abre
          com a cara dela. Sem nada lembrado, aparece o produto. */}
      <div className="pb-8 text-center">
        {marca?.logoMiniatura ? (
          <img
            src={marca.logoMiniatura}
            alt=""
            className="mx-auto mb-5 h-16 w-16 rounded-full object-contain"
          />
        ) : (
          <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-acento">
            <Wrench aria-hidden size={30} className="text-em-superficie" />
          </span>
        )}
        <h1 className="text-titulo text-em-fundo">{marca?.nome ?? 'Gestão para Oficinas'}</h1>
        <p className="pt-1 text-corpo text-em-fundo-2">
          Entre para ver o movimento da sua oficina.
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

        <div className="relative">
          <Campo
            rotulo="Senha"
            type={mostrarSenha ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Sua senha"
            className="pr-14"
            erro={errors.senha?.message}
            {...register('senha')}
          />
          <button
            type="button"
            onClick={() => setMostrarSenha((v) => !v)}
            aria-label={mostrarSenha ? 'Esconder senha' : 'Mostrar senha'}
            className="absolute right-1 top-7 flex h-toque w-toque items-center justify-center text-em-superficie-2"
          >
            {mostrarSenha ? <EyeOff aria-hidden size={20} /> : <Eye aria-hidden size={20} />}
          </button>
        </div>

        {erroGeral && (
          <p role="alert" className="rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro-forte">
            {erroGeral}
          </p>
        )}

        <Botao type="submit" largo carregando={isSubmitting} className="mt-2">
          Entrar
        </Botao>

        <Link
          to="/esqueci-a-senha"
          className="flex min-h-toque items-center justify-center text-corpo text-em-superficie-2"
        >
          Esqueci minha senha
        </Link>
      </form>

      <p className="px-4 pt-6 text-center text-apoio text-em-fundo-2">
        O acesso é criado pelo responsável da oficina. Se você ainda não tem
        login, peça a ele para cadastrar você.
      </p>

      <p className="pt-6 text-center text-corpo text-em-fundo-2">
        Ainda não tem conta?{' '}
        <Link to="/criar-conta" className="text-acento-forte">
          Criar a conta da minha oficina
        </Link>
      </p>

      <nav className="flex flex-wrap justify-center gap-4 pt-6 text-apoio text-em-fundo-2">
        <Link to="/termos" className="min-h-toque-fino">
          Termos de Uso
        </Link>
        <Link to="/privacidade" className="min-h-toque-fino">
          Política de Privacidade
        </Link>
      </nav>
    </main>
  )
}
