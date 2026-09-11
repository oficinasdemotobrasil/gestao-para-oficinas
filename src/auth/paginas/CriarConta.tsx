/**
 * A oficina cria a própria conta.
 *
 * Duas decisões que mudam o que a pessoa vê:
 *
 * 1. A tela pergunta à função se o cadastro está aberto ANTES de mostrar o
 *    formulário. Deixar alguém preencher seis campos para tomar um não no fim
 *    é o pior jeito de dizer "ainda não".
 *
 * 2. O aceite dos termos é uma caixa que começa desmarcada, com os dois
 *    documentos linkados ao lado. Caixa pré-marcada não é aceite — é
 *    distração, e é o tipo de coisa que não se sustenta numa discussão.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff, Wrench } from 'lucide-react'
import { z } from 'zod'
import { resolverZod } from '@/lib/formulario'
import { Botao } from '@/componentes/ui/Botao'
import { Campo } from '@/componentes/ui/Campo'
import { supabase } from '@/lib/supabase'
import { mascararTelefone } from '@/lib/formato'
import { VERSAO_DOS_DOCUMENTOS } from '@/funcionalidades/legal/documentos'

const esquema = z.object({
  oficina: z.string().trim().min(2, 'Informe o nome da oficina.'),
  responsavel: z.string().trim().min(2, 'Informe o seu nome.'),
  email: z.string().trim().email('Informe um e-mail válido.'),
  telefone: z
    .string()
    .trim()
    .refine((v) => v.replace(/\D/g, '').length >= 10, 'Informe o telefone com DDD.'),
  senha: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres.'),
})

type Dados = z.infer<typeof esquema>

export function CriarConta() {
  const navegar = useNavigate()
  const [aberto, setAberto] = useState<boolean | null>(null)
  const [aceitou, setAceitou] = useState(false)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [pronto, setPronto] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Dados>({ resolver: resolverZod<Dados, Dados>(esquema) })

  useEffect(() => {
    void supabase.functions
      .invoke('cadastro', { body: { acao: 'situacao' } })
      .then(({ data }) => setAberto(Boolean(data?.aberto)))
      .catch(() => setAberto(false))
  }, [])

  async function aoEnviar(dados: Dados) {
    setErroGeral(null)
    if (!aceitou) {
      setErroGeral('É preciso aceitar os Termos de Uso e a Política de Privacidade.')
      return
    }
    const { data, error } = await supabase.functions.invoke('cadastro', {
      body: {
        acao: 'criar',
        ...dados,
        aceitou_os_termos: true,
        termos_versao: VERSAO_DOS_DOCUMENTOS,
      },
    })

    let corpo = data as { ok?: boolean; erro?: string; campo?: string } | null
    if (error) {
      const resposta = (error as { context?: Response }).context
      corpo = resposta ? await resposta.json().catch(() => null) : null
    }
    if (corpo?.erro) {
      if (corpo.campo && corpo.campo in dados) {
        setError(corpo.campo as keyof Dados, { message: corpo.erro })
      } else {
        setErroGeral(corpo.erro)
      }
      return
    }
    setPronto(true)
  }

  if (aberto === null) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5">
        <p className="text-center text-corpo text-em-fundo-2">Carregando…</p>
      </main>
    )
  }

  if (!aberto) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10">
        <div className="rounded-card bg-superficie p-6 text-center">
          <h1 className="text-secao text-em-superficie">Ainda não abrimos o cadastro</h1>
          <p className="pt-2 text-corpo text-em-superficie-2">
            Por enquanto as contas são abertas uma a uma, com conversa antes.
            Chame a gente e a sua oficina entra.
          </p>
          <div className="pt-5">
            <Link
              to="/entrar"
              className="inline-flex min-h-toque items-center rounded-controle border border-borda-em-superficie px-5 text-corpo font-semibold text-em-superficie"
            >
              Voltar para entrar
            </Link>
          </div>
        </div>
      </main>
    )
  }

  if (pronto) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10">
        <div className="rounded-card bg-superficie p-6 text-center">
          <h1 className="text-secao text-em-superficie">Confirme o seu e-mail</h1>
          <p className="pt-2 text-corpo text-em-superficie-2">
            Mandamos uma mensagem para <strong>{watch('email')}</strong>. Clique
            no link dela para entrar na sua oficina.
          </p>
          <p className="pt-2 text-apoio text-em-superficie-2">
            Não chegou em alguns minutos? Olhe no spam.
          </p>
          <div className="pt-5">
            <Botao type="button" onClick={() => navegar('/entrar')}>
              Ir para a tela de entrar
            </Botao>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10">
      <div className="pb-6 text-center">
        <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-acento">
          <Wrench aria-hidden size={30} className="text-em-superficie" />
        </span>
        <h1 className="text-titulo text-em-fundo">Crie a conta da sua oficina</h1>
        <p className="pt-1 text-corpo text-em-fundo-2">
          Sete dias para experimentar, sem cartão.
        </p>
      </div>

      <form
        onSubmit={handleSubmit(aoEnviar)}
        noValidate
        className="flex flex-col gap-4 rounded-card bg-superficie p-6 shadow-card"
      >
        <Campo
          rotulo="Nome da oficina"
          obrigatorio
          autoCapitalize="words"
          erro={errors.oficina?.message}
          {...register('oficina')}
        />
        <Campo
          rotulo="Seu nome"
          obrigatorio
          autoCapitalize="words"
          erro={errors.responsavel?.message}
          {...register('responsavel')}
        />
        <Campo
          rotulo="E-mail"
          type="email"
          obrigatorio
          autoCapitalize="none"
          autoCorrect="off"
          dica="É por ele que você entra e recebe os avisos."
          erro={errors.email?.message}
          {...register('email')}
        />
        <Campo
          rotulo="Telefone"
          type="tel"
          inputMode="numeric"
          obrigatorio
          placeholder="(11) 90000-0000"
          erro={errors.telefone?.message}
          value={watch('telefone') ?? ''}
          onChange={(e) => setValue('telefone', mascararTelefone(e.target.value))}
        />

        <div className="relative">
          <Campo
            rotulo="Senha"
            type={mostrarSenha ? 'text' : 'password'}
            obrigatorio
            autoComplete="new-password"
            dica="Pelo menos 8 caracteres."
            erro={errors.senha?.message}
            {...register('senha')}
          />
          <button
            type="button"
            onClick={() => setMostrarSenha((v) => !v)}
            aria-label={mostrarSenha ? 'Esconder a senha' : 'Mostrar a senha'}
            className="absolute right-2 top-7 flex h-11 w-11 items-center justify-center text-em-superficie-2"
          >
            {mostrarSenha ? <EyeOff aria-hidden size={20} /> : <Eye aria-hidden size={20} />}
          </button>
        </div>

        {/* Começa desmarcada, e é conferida também no servidor. */}
        <label className="flex items-start gap-3 pt-1">
          <input
            type="checkbox"
            checked={aceitou}
            onChange={(e) => setAceitou(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-acento"
          />
          <span className="text-apoio text-em-superficie-2">
            Li e aceito os{' '}
            <Link to="/termos" target="_blank" className="text-acento-forte underline">
              Termos de Uso
            </Link>{' '}
            e a{' '}
            <Link to="/privacidade" target="_blank" className="text-acento-forte underline">
              Política de Privacidade
            </Link>
            .
          </span>
        </label>

        {erroGeral && (
          <p role="alert" className="rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro-forte">
            {erroGeral}
          </p>
        )}

        <Botao type="submit" largo carregando={isSubmitting} className="mt-1">
          Criar a minha oficina
        </Botao>
      </form>

      <p className="pt-6 text-center text-corpo text-em-fundo-2">
        Já tem conta?{' '}
        <Link to="/entrar" className="text-acento-forte">
          Entrar
        </Link>
      </p>
    </main>
  )
}
