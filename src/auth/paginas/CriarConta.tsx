/**
 * A oficina cria a própria conta, em dois passos.
 *
 * Primeiro o plano, depois quatro campos. A ordem é essa de propósito: quem
 * chega pelo site quer saber quanto custa antes de digitar qualquer coisa, e
 * um formulário de sete campos antes de ver o preço é onde se perde quem
 * estava só olhando.
 *
 * Três decisões que mudam o que a pessoa vê:
 *
 * 1. Todo mundo entra pelos 7 dias de teste, qualquer que seja o plano
 *    escolhido — e no teste o sistema é o maior plano (0066). Quem escolheu
 *    ver o financeiro vê o financeiro, e decide com o que viu.
 *
 * 2. Entrar é na hora: a conta já nasce válida e a pessoa cai em
 *    Configurações, com a sessão aberta. O preço disso é conhecido e foi
 *    aceito: o e-mail não é verificado antes do primeiro acesso.
 *
 * 3. O aceite dos termos é uma caixa que começa desmarcada, com os dois
 *    documentos linkados ao lado. Caixa pré-marcada não é aceite — é
 *    distração, e é o tipo de coisa que não se sustenta numa discussão.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Check, Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { z } from 'zod'
import { resolverZod } from '@/lib/formulario'
import { Botao } from '@/componentes/ui/Botao'
import { Campo } from '@/componentes/ui/Campo'
import { Carregando } from '@/componentes/ui/Carregando'
import { supabase } from '@/lib/supabase'
import { moeda } from '@/lib/formato'
import { VERSAO_DOS_DOCUMENTOS } from '@/funcionalidades/legal/documentos'
import { MolduraDeEntrada } from '@/auth/MolduraDeEntrada'
import { useAuth } from '@/auth/ProvedorAuth'

interface PlanoNaTela {
  id: string
  nome: string
  descricao: string | null
  preco_mensal: number | null
  beneficios: string[]
  dias_de_teste: number | null
  limite_colaboradores: number | null
  tem_financeiro: boolean
}

const esquema = z
  .object({
    oficina: z.string().trim().min(2, 'Informe o nome da oficina.'),
    email: z.string().trim().email('Informe um e-mail válido.'),
    senha: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres.'),
    confirmacao: z.string(),
  })
  // A confirmação existe porque a senha é digitada escondida e errar nela
  // significa não conseguir entrar logo depois — com a conta já criada.
  .refine((d) => d.senha === d.confirmacao, {
    message: 'As duas senhas precisam ser iguais.',
    path: ['confirmacao'],
  })

type Dados = z.infer<typeof esquema>

/**
 * `previa` existe para a porta de conferência em desenvolvimento: a tela
 * depende de uma função do Supabase que só responde com o cadastro aberto, e
 * sem isto não daria para olhar o layout dos dois passos antes de publicar.
 */
export function CriarConta({ previa }: { previa?: PlanoNaTela[] }) {
  const navegar = useNavigate()
  const { entrar } = useAuth()
  const [aberto, setAberto] = useState<boolean | null>(null)
  const [planos, setPlanos] = useState<PlanoNaTela[] | null>(null)
  const [escolhido, setEscolhido] = useState<PlanoNaTela | null>(null)
  const [aceitou, setAceitou] = useState(false)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [mostrarSenha, setMostrarSenha] = useState(false)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Dados>({ resolver: resolverZod<Dados, Dados>(esquema) })

  useEffect(() => {
    if (previa) {
      setAberto(true)
      setPlanos(previa)
      return
    }

    void supabase.functions
      .invoke('cadastro', { body: { acao: 'situacao' } })
      .then(({ data }) => setAberto(Boolean(data?.aberto)))
      .catch(() => setAberto(false))

    void supabase.functions
      .invoke('cadastro', { body: { acao: 'planos' } })
      .then(({ data }) => setPlanos((data?.planos as PlanoNaTela[]) ?? []))
      .catch(() => setPlanos([]))
  }, [previa])

  async function aoEnviar(dados: Dados) {
    setErroGeral(null)
    if (!aceitou) {
      setErroGeral('É preciso aceitar os Termos de Uso e a Política de Privacidade.')
      return
    }

    const { data, error } = await supabase.functions.invoke('cadastro', {
      body: {
        acao: 'criar',
        oficina: dados.oficina,
        email: dados.email,
        senha: dados.senha,
        plano: escolhido?.id,
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
      if (corpo.campo === 'oficina' || corpo.campo === 'email' || corpo.campo === 'senha') {
        setError(corpo.campo, { message: corpo.erro })
      } else {
        setErroGeral(corpo.erro)
      }
      return
    }

    // A conta existe: entrar é o passo seguinte, e não outra tela pedindo para
    // a pessoa digitar de novo o que acabou de digitar. Passa pelo `entrar` do
    // app, e não direto pelo Supabase, para o contexto de autenticação já subir
    // com a oficina e a cor da marca.
    try {
      await entrar(dados.email, dados.senha)
    } catch {
      setErroGeral(
        'A conta foi criada, mas não consegui entrar automaticamente. Use a tela de entrar.',
      )
      return
    }

    // Cai nas configurações: é lá que estão os dados que faltam — telefone,
    // endereço, CNPJ, logo e cor.
    navegar('/configuracoes?novo=1', { replace: true })
  }

  if (aberto === null || planos === null) {
    return (
      <MolduraDeEntrada>
        <Carregando />
      </MolduraDeEntrada>
    )
  }

  if (!aberto) {
    return (
      <MolduraDeEntrada>
        <div className="rounded-card bg-superficie p-6 text-center">
          <h1 className="text-secao text-em-superficie">Ainda não abrimos o cadastro</h1>
          <p className="pt-2 text-corpo text-em-superficie-2">
            Por enquanto as contas são abertas uma a uma, com conversa antes. Chame a gente e a
            sua oficina entra.
          </p>
          <div className="pt-5">
            {/* "no-card" porque este botão está DENTRO do cartão branco: a
                variante de fundo escuro escreveria em branco sobre branco, e o
                botão apareceu vazio no site. */}
            <Botao largo variante="contorno-no-card" onClick={() => navegar('/entrar')}>
              Voltar para entrar
            </Botao>
          </div>
        </div>
      </MolduraDeEntrada>
    )
  }

  // Passo 1: o plano ---------------------------------------------------------
  if (!escolhido) {
    return (
      <MolduraDeEntrada>
        <div className="pb-6">
          <h1 className="text-secao text-em-fundo">Escolha o seu plano</h1>
          <p className="pt-1 text-corpo text-em-fundo-2">
            Você testa 7 dias com tudo liberado, sem cartão. Só paga se decidir ficar.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {planos.map((plano) => (
            <button
              key={plano.id}
              type="button"
              onClick={() => setEscolhido(plano)}
              className="rounded-card bg-superficie p-5 text-left shadow-card active:opacity-90"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-secao text-em-superficie">{plano.nome}</span>
                <span className="shrink-0 text-corpo font-semibold text-em-superficie">
                  {plano.preco_mensal ? `${moeda(plano.preco_mensal)}/mês` : 'Grátis'}
                </span>
              </div>
              {plano.descricao && (
                <p className="pt-1 text-apoio text-em-superficie-2">{plano.descricao}</p>
              )}

              <ul className="flex flex-col gap-2 pt-4">
                {plano.beneficios.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-apoio text-em-superficie-2">
                    <Check aria-hidden size={16} className="mt-0.5 shrink-0 text-sucesso-forte" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>

              <p className="pt-4 text-corpo font-medium text-acento-forte">Começar com este</p>
            </button>
          ))}
        </div>

        <p className="pt-6 text-center text-corpo text-em-fundo-2 desktop:text-left">
          Já tem conta?{' '}
          <Link to="/entrar" className="text-acento-forte">
            Entrar
          </Link>
        </p>
      </MolduraDeEntrada>
    )
  }

  // Passo 2: a conta ---------------------------------------------------------
  return (
    <MolduraDeEntrada>
      <button
        type="button"
        onClick={() => setEscolhido(null)}
        className="flex min-h-toque items-center gap-1.5 text-corpo text-em-fundo-2"
      >
        <ArrowLeft aria-hidden size={18} />
        Trocar de plano
      </button>

      <div className="pb-6 pt-2">
        <h1 className="text-secao text-em-fundo">Criar a conta da oficina</h1>
        <p className="pt-1 text-corpo text-em-fundo-2">
          Plano {escolhido.nome} · 7 dias de teste com tudo liberado, sem cartão.
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
          placeholder="Oficina do Tiago"
          dica="É o nome que aparece no orçamento e na tela de entrar."
          erro={errors.oficina?.message}
          {...register('oficina')}
        />

        <Campo
          rotulo="E-mail"
          obrigatorio
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          placeholder="voce@oficina.com.br"
          erro={errors.email?.message}
          {...register('email')}
        />

        <div className="relative">
          <Campo
            rotulo="Senha"
            obrigatorio
            type={mostrarSenha ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Pelo menos 8 caracteres"
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

        <Campo
          rotulo="Confirmar senha"
          obrigatorio
          type={mostrarSenha ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder="Digite a senha de novo"
          erro={errors.confirmacao?.message}
          {...register('confirmacao')}
        />

        <label className="flex items-start gap-3 pt-1">
          <input
            type="checkbox"
            checked={aceitou}
            onChange={(e) => setAceitou(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-[rgb(var(--cor-acento))]"
          />
          <span className="text-apoio text-em-superficie-2">
            Li e aceito os{' '}
            <Link to="/termos" className="text-acento-forte">
              Termos de Uso
            </Link>{' '}
            e a{' '}
            <Link to="/privacidade" className="text-acento-forte">
              Política de Privacidade
            </Link>
            .
          </span>
        </label>

        {erroGeral && (
          <p
            role="alert"
            className="rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro-forte"
          >
            {erroGeral}
          </p>
        )}

        <Botao type="submit" largo carregando={isSubmitting} className="mt-1">
          Criar conta e começar
        </Botao>
      </form>

      <p className="pt-5 text-center text-apoio text-em-fundo-2 desktop:text-left">
        Depois de criar, você cai direto nas configurações da oficina para completar telefone,
        endereço e logo.
      </p>
    </MolduraDeEntrada>
  )
}
