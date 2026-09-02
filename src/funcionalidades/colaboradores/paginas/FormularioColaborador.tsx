import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { resolverZod } from '@/lib/formulario'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { Tela, CabecalhoInterno } from '@/componentes/layout/Tela'
import { Campo, Selecao, Interruptor } from '@/componentes/ui/Campo'
import { Botao } from '@/componentes/ui/Botao'
import { Carregando } from '@/componentes/ui/Carregando'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { mascararTelefone } from '@/lib/formato'
import { useAuth } from '@/auth/ProvedorAuth'
import {
  esquemaColaborador,
  esquemaNovoColaborador,
  type DadosFormularioNovoColaborador,
  type DadosColaboradorSubmetidos,
} from '../esquemas'
import {
  criarColaborador,
  atualizarColaborador,
  obterColaborador,
  alternarAtivoColaborador,
} from '../api'

export function FormularioColaborador() {
  const { id } = useParams<{ id: string }>()
  const editando = Boolean(id)
  const navegar = useNavigate()
  const toast = useToast()
  const cache = useQueryClient()
  const { usuario } = useAuth()
  const [mostrarSenha, setMostrarSenha] = useState(false)

  const { data: colaborador, isPending: carregando } = useQuery({
    queryKey: ['colaborador', id],
    queryFn: () => obterColaborador(id!),
    enabled: editando,
  })

  const souEu = editando && id === usuario?.id

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DadosFormularioNovoColaborador, unknown, DadosColaboradorSubmetidos>({
    resolver: resolverZod<DadosFormularioNovoColaborador, DadosColaboradorSubmetidos>(
      editando ? esquemaColaborador : esquemaNovoColaborador,
    ),
    defaultValues: { nome: '', email: '', senha: '', telefone: '', perfil: 'vendedor' },
  })

  useEffect(() => {
    if (colaborador) {
      reset({
        nome: colaborador.nome,
        email: colaborador.email,
        senha: '',
        telefone: colaborador.telefone ?? '',
        perfil: colaborador.perfil,
      })
    }
  }, [colaborador, reset])

  const salvar = useMutation({
    mutationFn: async (dados: DadosColaboradorSubmetidos) => {
      if (editando) {
        const { email: _email, senha: _senha, ...edicao } = dados
        return atualizarColaborador(id!, edicao)
      }
      return criarColaborador({
        nome: dados.nome,
        email: dados.email!,
        senha: dados.senha!,
        telefone: dados.telefone,
        perfil: dados.perfil,
      })
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['colaboradores'] })
      void cache.invalidateQueries({ queryKey: ['colaborador', id] })
      toast.sucesso(editando ? 'Colaborador atualizado.' : 'Colaborador cadastrado.')
      navegar('/colaboradores', { replace: true })
    },
    onError: (erro) => setError('root', { message: traduzirErro(erro) }),
  })

  const alternarAtivo = useMutation({
    mutationFn: (ativo: boolean) => alternarAtivoColaborador(id!, ativo),
    onSuccess: (_, ativo) => {
      void cache.invalidateQueries({ queryKey: ['colaboradores'] })
      void cache.invalidateQueries({ queryKey: ['colaborador', id] })
      toast.sucesso(ativo ? 'Acesso reativado.' : 'Acesso desativado.')
    },
    onError: (erro) => toast.erro(traduzirErro(erro)),
  })

  if (editando && carregando) return <Carregando />

  return (
    <Tela>
      <CabecalhoInterno
        titulo={editando ? 'Editar colaborador' : 'Novo colaborador'}
        contexto={editando ? colaborador?.email : undefined}
      />

      <form
        onSubmit={handleSubmit((d) => salvar.mutate(d))}
        noValidate
        className="flex flex-col gap-4 rounded-card bg-superficie p-5 shadow-card"
      >
        <Campo
          rotulo="Nome"
          obrigatorio
          autoCapitalize="words"
          placeholder="Jorge Almeida"
          erro={errors.nome?.message}
          {...register('nome')}
        />

        {!editando && (
          <>
            <Campo
              rotulo="E-mail"
              obrigatorio
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="jorge@oficina.com.br"
              dica="É com este e-mail que ele vai entrar no app."
              erro={errors.email?.message}
              {...register('email')}
            />

            <div className="relative">
              <Campo
                rotulo="Senha inicial"
                obrigatorio
                type={mostrarSenha ? 'text' : 'password'}
                autoComplete="new-password"
                className="pr-14"
                dica="Pelo menos 8 caracteres. Ele pode trocar depois."
                erro={errors.senha?.message}
                {...register('senha')}
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((v) => !v)}
                aria-label={mostrarSenha ? 'Esconder senha' : 'Mostrar senha'}
                className="absolute right-1 top-7 flex h-toque w-toque items-center justify-center text-claro-secundario"
              >
                {mostrarSenha ? <EyeOff aria-hidden size={20} /> : <Eye aria-hidden size={20} />}
              </button>
            </div>
          </>
        )}

        <Controller
          name="telefone"
          control={control}
          render={({ field }) => (
            <Campo
              rotulo="Telefone"
              type="tel"
              inputMode="numeric"
              placeholder="(11) 98765-4321"
              erro={errors.telefone?.message}
              value={field.value ?? ''}
              onChange={(e) => field.onChange(mascararTelefone(e.target.value))}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />

        {/* O admin não pode rebaixar a si mesmo: se ele fosse o único, a oficina
            ficaria sem ninguém capaz de mexer em configurações. O banco também
            recusa, mas é melhor não deixar nem tentar. */}
        <Selecao
          rotulo="Perfil de acesso"
          obrigatorio
          disabled={souEu}
          dica={
            souEu
              ? 'Você não pode alterar o próprio perfil.'
              : 'Administrador vê tudo. Vendedor não vê custo nem financeiro. Mecânico vê só as ordens dele.'
          }
          erro={errors.perfil?.message}
          {...register('perfil')}
        >
          <option value="admin">Administrador</option>
          <option value="vendedor">Vendedor</option>
          <option value="mecanico">Mecânico</option>
        </Selecao>

        {errors.root && (
          <p role="alert" className="rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro">
            {errors.root.message}
          </p>
        )}

        <Botao type="submit" largo carregando={isSubmitting || salvar.isPending} className="mt-2">
          {editando ? 'Salvar alterações' : 'Cadastrar colaborador'}
        </Botao>
      </form>

      {editando && colaborador && !souEu && (
        <div className="mt-4 rounded-card bg-superficie p-5 shadow-card">
          <Interruptor
            rotulo="Acesso ativo"
            descricao="Desativado, ele não consegue entrar no app. O histórico do que ele fez continua guardado."
            marcado={colaborador.ativo}
            desabilitado={alternarAtivo.isPending}
            aoMudar={(valor) => alternarAtivo.mutate(valor)}
          />
        </div>
      )}
    </Tela>
  )
}
