import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Botao } from '@/componentes/ui/Botao'
import { Campo } from '@/componentes/ui/Campo'
import { Carregando } from '@/componentes/ui/Carregando'
import { EstadoErro } from '@/componentes/ui/EstadoVazio'
import { useAuth } from '@/auth/ProvedorAuth'
import { useToast } from '@/componentes/ui/Toast'
import { esquemaNovaSenha, type DadosNovaSenha } from '@/auth/esquemas'

/**
 * Tela aberta pelo link do e-mail. O Supabase troca o código da URL por uma
 * sessão temporária sozinho (detectSessionInUrl), então aqui basta esperar a
 * sessão aparecer e pedir a nova senha.
 */
export function RedefinirSenha() {
  const { sessao, carregando, definirNovaSenha } = useAuth()
  const navegar = useNavigate()
  const toast = useToast()
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [linkExpirado, setLinkExpirado] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DadosNovaSenha>({ resolver: zodResolver(esquemaNovaSenha) })

  useEffect(() => {
    // O próprio Supabase devolve o motivo na âncora da URL quando o link falha.
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    if (hash.get('error')) setLinkExpirado(true)
  }, [])

  async function aoEnviar(dados: DadosNovaSenha) {
    setErroGeral(null)
    try {
      await definirNovaSenha(dados.senha)
      toast.sucesso('Senha alterada. Você já pode usar o app.')
      navegar('/', { replace: true })
    } catch (e) {
      setErroGeral((e as Error).message)
    }
  }

  if (carregando) return <Carregando rotulo="Abrindo o link…" />

  if (linkExpirado || !sessao) {
    return (
      <EstadoErro
        titulo="Este link não vale mais"
        descricao="Links de recuperação valem por uma hora e só podem ser usados uma vez. Peça um novo na tela de login."
        aoTentarDeNovo={() => navegar('/esqueci-a-senha', { replace: true })}
      />
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10">
      <div className="pb-6">
        <h1 className="text-titulo text-escuro">Criar nova senha</h1>
        <p className="pt-1 text-corpo text-escuro-secundario">
          Escolha uma senha de pelo menos 8 caracteres.
        </p>
      </div>

      <form
        onSubmit={handleSubmit(aoEnviar)}
        noValidate
        className="flex flex-col gap-4 rounded-card bg-superficie p-6 shadow-card"
      >
        <Campo
          rotulo="Nova senha"
          type="password"
          autoComplete="new-password"
          erro={errors.senha?.message}
          {...register('senha')}
        />
        <Campo
          rotulo="Repita a nova senha"
          type="password"
          autoComplete="new-password"
          erro={errors.confirmacao?.message}
          {...register('confirmacao')}
        />

        {erroGeral && (
          <p role="alert" className="rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro">
            {erroGeral}
          </p>
        )}

        <Botao type="submit" largo carregando={isSubmitting} className="mt-2">
          Salvar senha
        </Botao>
      </form>
    </main>
  )
}
