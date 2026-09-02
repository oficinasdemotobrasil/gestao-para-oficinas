import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { resolverZod } from '@/lib/formulario'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Tela, CabecalhoInterno } from '@/componentes/layout/Tela'
import { Campo, AreaTexto, Interruptor } from '@/componentes/ui/Campo'
import { Botao } from '@/componentes/ui/Botao'
import { Carregando } from '@/componentes/ui/Carregando'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { moeda } from '@/lib/formato'
import { paraNumero } from '@/lib/numero'
import { usePermissoes } from '@/auth/usePermissoes'
import {
  esquemaProduto,
  type DadosFormularioProduto,
  type DadosProdutoValidados,
} from '../esquemas'
import { criarProduto, atualizarProduto, obterProduto } from '../api'

export function FormularioProduto() {
  const { id } = useParams<{ id: string }>()
  const editando = Boolean(id)
  const navegar = useNavigate()
  const toast = useToast()
  const cache = useQueryClient()
  const p = usePermissoes()

  const { data: produto, isPending: carregando } = useQuery({
    queryKey: ['produto', id, p.verCusto],
    queryFn: () => obterProduto(id!, p.verCusto),
    enabled: editando,
  })

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DadosFormularioProduto, unknown, DadosProdutoValidados>({
    resolver: resolverZod<DadosFormularioProduto, DadosProdutoValidados>(esquemaProduto),
    defaultValues: {
      nome: '',
      codigo: '',
      descricao: '',
      unidade: 'un',
      preco_custo: '',
      preco_venda: '',
      estoque_atual: '',
      estoque_minimo: '',
      ativo: true,
    },
  })

  useEffect(() => {
    if (produto) {
      reset({
        nome: produto.nome,
        codigo: produto.codigo ?? '',
        descricao: produto.descricao ?? '',
        unidade: produto.unidade,
        preco_custo: String(produto.preco_custo ?? 0).replace('.', ','),
        preco_venda: String(produto.preco_venda).replace('.', ','),
        estoque_atual: String(produto.estoque_atual).replace('.', ','),
        estoque_minimo: String(produto.estoque_minimo).replace('.', ','),
        ativo: produto.ativo,
      })
    }
  }, [produto, reset])

  // A margem aparece enquanto se digita: quem cadastra vê na hora se o preço
  // de venda faz sentido, em vez de descobrir no fechamento do mês.
  const custoDigitado = useWatch({ control, name: 'preco_custo' })
  const vendaDigitada = useWatch({ control, name: 'preco_venda' })
  const custo = paraNumero(String(custoDigitado ?? ''))
  const venda = paraNumero(String(vendaDigitada ?? ''))
  const temMargem = Number.isFinite(custo) && Number.isFinite(venda) && venda > 0 && custo > 0
  const lucro = venda - custo
  const margem = temMargem ? (lucro / venda) * 100 : 0

  const salvar = useMutation({
    mutationFn: (dados: DadosProdutoValidados) =>
      editando ? atualizarProduto(id!, dados) : criarProduto(dados),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['produtos'] })
      void cache.invalidateQueries({ queryKey: ['produto', id] })
      toast.sucesso(editando ? 'Produto atualizado.' : 'Produto cadastrado.')
      navegar(editando ? `/catalogo/produtos/${id}` : '/catalogo', { replace: true })
    },
    onError: (erro) => setError('root', { message: traduzirErro(erro) }),
  })

  if (editando && carregando) return <Carregando />

  return (
    <Tela>
      <CabecalhoInterno titulo={editando ? 'Editar produto' : 'Novo produto'} />

      <form
        onSubmit={handleSubmit((d) => salvar.mutate(d))}
        noValidate
        className="flex flex-col gap-4 rounded-card bg-superficie p-5 shadow-card"
      >
        <Campo
          rotulo="Nome"
          obrigatorio
          autoCapitalize="sentences"
          placeholder="Óleo 10W30 semissintético"
          erro={errors.nome?.message}
          {...register('nome')}
        />

        <div className="grid grid-cols-2 gap-3">
          <Campo
            rotulo="Código"
            autoCapitalize="characters"
            placeholder="Opcional"
            erro={errors.codigo?.message}
            {...register('codigo')}
          />
          <Campo
            rotulo="Unidade"
            placeholder="un, L, kg"
            erro={errors.unidade?.message}
            {...register('unidade')}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Campo
            rotulo="Preço de custo"
            inputMode="decimal"
            placeholder="22,00"
            erro={errors.preco_custo?.message}
            {...register('preco_custo')}
          />
          <Campo
            rotulo="Preço de venda"
            inputMode="decimal"
            placeholder="45,00"
            erro={errors.preco_venda?.message}
            {...register('preco_venda')}
          />
        </div>

        {temMargem && (
          <div className="flex items-baseline justify-between rounded-controle bg-acento-suave px-4 py-3">
            <span className="text-rotulo text-claro-secundario">Margem</span>
            <span className="text-corpo font-semibold text-claro">
              {moeda(lucro)} · {margem.toFixed(0)}%
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {/* Na edição o saldo é só leitura: ele muda por entrada, saída ou
              ajuste, nunca por digitação no cadastro. No produto novo, o que for
              digitado aqui vira a movimentação de saldo inicial. */}
          <Campo
            rotulo="Estoque atual"
            inputMode="decimal"
            placeholder="0"
            disabled={editando}
            dica={editando ? 'Alterado por movimentação.' : 'Saldo que já existe hoje.'}
            erro={errors.estoque_atual?.message}
            {...register('estoque_atual')}
          />
          <Campo
            rotulo="Estoque mínimo"
            inputMode="decimal"
            placeholder="0"
            dica="Alerta quando chegar aqui."
            erro={errors.estoque_minimo?.message}
            {...register('estoque_minimo')}
          />
        </div>

        <AreaTexto
          rotulo="Descrição"
          placeholder="Opcional"
          erro={errors.descricao?.message}
          {...register('descricao')}
        />

        <div className="border-t border-borda-clara pt-2">
          <Controller
            name="ativo"
            control={control}
            render={({ field }) => (
              <Interruptor
                rotulo="Produto ativo"
                descricao="Produto inativo não aparece para uso em orçamentos e serviços."
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
          {editando ? 'Salvar alterações' : 'Cadastrar produto'}
        </Botao>
      </form>
    </Tela>
  )
}
