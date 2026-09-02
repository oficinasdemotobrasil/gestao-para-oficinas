import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { resolverZod } from '@/lib/formulario'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Tela, CabecalhoInterno } from '@/componentes/layout/Tela'
import { Campo, AreaTexto, Interruptor } from '@/componentes/ui/Campo'
import { Botao } from '@/componentes/ui/Botao'
import { Carregando } from '@/componentes/ui/Carregando'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import {
  esquemaServico,
  type DadosFormularioServico,
  type DadosServicoValidados,
} from '../esquemas'
import { criarServico, atualizarServico, obterServico } from '../api'

export function FormularioServico() {
  const { id } = useParams<{ id: string }>()
  const editando = Boolean(id)
  const navegar = useNavigate()
  const toast = useToast()
  const cache = useQueryClient()

  const { data: servico, isPending: carregando } = useQuery({
    queryKey: ['servico', id],
    queryFn: () => obterServico(id!),
    enabled: editando,
  })

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DadosFormularioServico, unknown, DadosServicoValidados>({
    resolver: resolverZod<DadosFormularioServico, DadosServicoValidados>(esquemaServico),
    defaultValues: {
      nome: '',
      descricao: '',
      preco: '',
      tempo_estimado_minutos: '',
      ativo: true,
    },
  })

  useEffect(() => {
    if (servico) {
      reset({
        nome: servico.nome,
        descricao: servico.descricao ?? '',
        preco: String(servico.preco).replace('.', ','),
        tempo_estimado_minutos: servico.tempo_estimado_minutos
          ? String(servico.tempo_estimado_minutos)
          : '',
        ativo: servico.ativo,
      })
    }
  }, [servico, reset])

  const salvar = useMutation({
    mutationFn: (dados: DadosServicoValidados) =>
      editando ? atualizarServico(id!, dados) : criarServico(dados),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['servicos'] })
      void cache.invalidateQueries({ queryKey: ['servico', id] })
      toast.sucesso(editando ? 'Serviço atualizado.' : 'Serviço cadastrado.')
      navegar('/catalogo?aba=servicos', { replace: true })
    },
    onError: (erro) => setError('root', { message: traduzirErro(erro) }),
  })

  if (editando && carregando) return <Carregando />

  return (
    <Tela>
      <CabecalhoInterno titulo={editando ? 'Editar serviço' : 'Novo serviço'} />

      <form
        onSubmit={handleSubmit((d) => salvar.mutate(d))}
        noValidate
        className="flex flex-col gap-4 rounded-card bg-superficie p-5 shadow-card"
      >
        <Campo
          rotulo="Nome"
          obrigatorio
          autoCapitalize="sentences"
          placeholder="Troca de óleo e filtro"
          erro={errors.nome?.message}
          {...register('nome')}
        />

        <div className="grid grid-cols-2 gap-3">
          <Campo
            rotulo="Preço"
            inputMode="decimal"
            placeholder="60,00"
            erro={errors.preco?.message}
            {...register('preco')}
          />
          <Campo
            rotulo="Tempo estimado"
            inputMode="numeric"
            placeholder="30"
            dica="Em minutos."
            erro={errors.tempo_estimado_minutos?.message}
            {...register('tempo_estimado_minutos')}
          />
        </div>

        <AreaTexto
          rotulo="Descrição"
          placeholder="O que está incluído neste serviço"
          erro={errors.descricao?.message}
          {...register('descricao')}
        />

        <div className="border-t border-borda-clara pt-2">
          <Controller
            name="ativo"
            control={control}
            render={({ field }) => (
              <Interruptor
                rotulo="Serviço ativo"
                descricao="Serviço inativo não aparece para uso em orçamentos e ordens."
                marcado={field.value}
                aoMudar={field.onChange}
              />
            )}
          />
        </div>

        {errors.root && (
          <p role="alert" className="rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro">
            {errors.root.message}
          </p>
        )}

        <Botao type="submit" largo carregando={isSubmitting || salvar.isPending} className="mt-2">
          {editando ? 'Salvar alterações' : 'Cadastrar serviço'}
        </Botao>
      </form>
    </Tela>
  )
}
