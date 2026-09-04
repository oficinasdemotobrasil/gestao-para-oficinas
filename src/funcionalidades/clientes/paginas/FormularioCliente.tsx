import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { resolverZod } from '@/lib/formulario'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Tela, CabecalhoInterno } from '@/componentes/layout/Tela'
import { Campo, AreaTexto } from '@/componentes/ui/Campo'
import { Botao } from '@/componentes/ui/Botao'
import { Formulario, LinhaInteira } from '@/componentes/ui/Formulario'
import { Carregando } from '@/componentes/ui/Carregando'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { mascararTelefone } from '@/lib/formato'
import {
  esquemaCliente,
  type DadosFormularioCliente,
  type DadosClienteValidados,
} from '../esquemas'
import { criarCliente, atualizarCliente, obterCliente, type DadosCliente } from '../api'

export function FormularioCliente() {
  const { id } = useParams<{ id: string }>()
  const editando = Boolean(id)
  const navegar = useNavigate()
  const toast = useToast()
  const cache = useQueryClient()

  const { data: cliente, isPending: carregandoCliente } = useQuery({
    queryKey: ['cliente', id],
    queryFn: () => obterCliente(id!),
    enabled: editando,
  })

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DadosFormularioCliente, unknown, DadosClienteValidados>({
    resolver: resolverZod<DadosFormularioCliente, DadosClienteValidados>(esquemaCliente),
    defaultValues: {
      nome: '',
      telefone: '',
      email: '',
      cpf_cnpj: '',
      observacoes: '',
    },
  })

  useEffect(() => {
    if (cliente) {
      reset({
        nome: cliente.nome,
        telefone: cliente.telefone ?? '',
        email: cliente.email ?? '',
        cpf_cnpj: cliente.cpf_cnpj ?? '',
        observacoes: cliente.observacoes ?? '',
      })
    }
  }, [cliente, reset])

  const salvar = useMutation({
    mutationFn: (dados: DadosCliente) =>
      editando ? atualizarCliente(id!, dados) : criarCliente(dados),
    onSuccess: (salvo) => {
      void cache.invalidateQueries({ queryKey: ['clientes'] })
      void cache.invalidateQueries({ queryKey: ['cliente', salvo.id] })
      toast.sucesso(editando ? 'Cliente atualizado.' : 'Cliente cadastrado.')
      navegar(`/clientes/${salvo.id}`, { replace: true })
    },
    onError: (erro) => {
      setError('root', { message: traduzirErro(erro) })
    },
  })

  if (editando && carregandoCliente) return <Carregando />

  return (
    <Tela>
      <CabecalhoInterno titulo={editando ? 'Editar cliente' : 'Novo cliente'} />

      <Formulario aoEnviar={handleSubmit((dados) => salvar.mutate(dados))}>
        <Campo
          rotulo="Nome"
          obrigatorio
          autoCapitalize="words"
          placeholder="Carlos da Silva"
          erro={errors.nome?.message}
          {...register('nome')}
        />

        {/* A máscara é aplicada enquanto digita: o teclado numérico do celular
            não tem parêntese nem hífen. */}
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

        <Campo
          rotulo="E-mail"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="carlos@email.com"
          erro={errors.email?.message}
          {...register('email')}
        />

        <Campo
          rotulo="CPF ou CNPJ"
          inputMode="numeric"
          placeholder="Só os números"
          erro={errors.cpf_cnpj?.message}
          {...register('cpf_cnpj')}
        />

        <LinhaInteira>
          <AreaTexto
            rotulo="Observações"
            placeholder="Alguma coisa que a oficina precisa lembrar sobre este cliente"
            erro={errors.observacoes?.message}
            {...register('observacoes')}
          />
        </LinhaInteira>

        {errors.root && (
          <LinhaInteira>
            <p role="alert" className="rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro">
              {errors.root.message}
            </p>
          </LinhaInteira>
        )}

        <LinhaInteira className="tablet:flex tablet:justify-end">
          <Botao
            type="submit"
            largo
            compactoNoDesktop
            carregando={isSubmitting || salvar.isPending}
            className="mt-2"
          >
            {editando ? 'Salvar alterações' : 'Cadastrar cliente'}
          </Botao>
        </LinhaInteira>
      </Formulario>
    </Tela>
  )
}
