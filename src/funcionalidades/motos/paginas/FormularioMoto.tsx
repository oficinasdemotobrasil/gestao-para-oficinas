import { useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { resolverZod } from '@/lib/formulario'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Tela, CabecalhoInterno } from '@/componentes/layout/Tela'
import { Campo, Selecao } from '@/componentes/ui/Campo'
import { Botao } from '@/componentes/ui/Botao'
import { Formulario, LinhaInteira } from '@/componentes/ui/Formulario'
import { Carregando } from '@/componentes/ui/Carregando'
import { EstadoVazio } from '@/componentes/ui/EstadoVazio'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'
import { listarClientes } from '@/funcionalidades/clientes/api'
import { Users } from 'lucide-react'
import {
  esquemaMoto,
  esquemaNovaMoto,
  type DadosFormularioNovaMoto,
  type DadosMotoSubmetidos,
} from '../esquemas'
import { criarMoto, atualizarMoto, obterMoto } from '../api'
import { MARCAS_DE_MOTO } from '../marcas'

export function FormularioMoto() {
  const { id } = useParams<{ id: string }>()
  const editando = Boolean(id)
  const [parametros] = useSearchParams()
  const navegar = useNavigate()
  const toast = useToast()
  const cache = useQueryClient()

  const { data: moto, isPending: carregandoMoto } = useQuery({
    queryKey: ['moto', id],
    queryFn: () => obterMoto(id!),
    enabled: editando,
  })

  // Só o cadastro precisa da lista de clientes: na edição o dono não muda aqui,
  // porque troca de dono é histórico, não correção de campo.
  const { data: clientes, isPending: carregandoClientes } = useQuery({
    queryKey: ['clientes', ''],
    queryFn: () => listarClientes(''),
    enabled: !editando,
  })

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    // O terceiro tipo é o que chega no onSubmit: os dados JÁ convertidos pelo
    // Zod. Sem ele, a tela recebia texto e convertia de novo — que é o defeito
    // que derrubava o cadastro.
  } = useForm<DadosFormularioNovaMoto, unknown, DadosMotoSubmetidos>({
    resolver: resolverZod<DadosFormularioNovaMoto, DadosMotoSubmetidos>(
      editando ? esquemaMoto : esquemaNovaMoto,
    ),
    defaultValues: {
      cliente_id: parametros.get('cliente') ?? '',
      placa: '',
      marca: '',
      modelo: '',
      ano: '',
      cor: '',
      chassi: '',
      km_atual: '',
    },
  })

  useEffect(() => {
    if (moto) {
      reset({
        cliente_id: '',
        placa: moto.placa,
        marca: moto.marca ?? '',
        modelo: moto.modelo ?? '',
        ano: moto.ano ? String(moto.ano) : '',
        cor: moto.cor ?? '',
        chassi: moto.chassi ?? '',
        km_atual: String(moto.km_atual),
      })
    }
  }, [moto, reset])

  const salvar = useMutation({
    mutationFn: async (validados: DadosMotoSubmetidos) => {
      const { cliente_id, ...dados } = validados
      if (editando) return atualizarMoto(id!, dados)
      return criarMoto(cliente_id!, dados)
    },
    onSuccess: (salva) => {
      void cache.invalidateQueries({ queryKey: ['motos'] })
      void cache.invalidateQueries({ queryKey: ['moto', salva.id] })
      void cache.invalidateQueries({ queryKey: ['cliente'] })
      toast.sucesso(editando ? 'Moto atualizada.' : 'Moto cadastrada.')
      navegar(`/motos/${salva.id}`, { replace: true })
    },
    onError: (erro) => setError('root', { message: traduzirErro(erro) }),
  })

  if (editando && carregandoMoto) return <Carregando />
  if (!editando && carregandoClientes) return <Carregando />

  // Sem cliente cadastrado não há como vincular a moto a ninguém.
  if (!editando && clientes && clientes.length === 0) {
    return (
      <Tela>
        <CabecalhoInterno titulo="Nova moto" />
        <EstadoVazio
          icone={<Users aria-hidden size={28} />}
          titulo="Cadastre um cliente primeiro"
          descricao="Toda moto nasce ligada a um dono. Cadastre o cliente e volte para registrar a moto dele."
          rotuloAcao="Cadastrar cliente"
          aoAgir={() => navegar('/clientes/novo')}
        />
      </Tela>
    )
  }

  return (
    <Tela>
      <CabecalhoInterno titulo={editando ? 'Editar moto' : 'Nova moto'} />

      <Formulario aoEnviar={handleSubmit((dados) => salvar.mutate(dados))}>
        {!editando && (
          <Selecao
            rotulo="Dono da moto"
            obrigatorio
            erro={errors.cliente_id?.message}
            {...register('cliente_id')}
          >
            <option value="">Escolha o cliente</option>
            {clientes?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Selecao>
        )}

        <Campo
          rotulo="Placa"
          obrigatorio
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="ABC1D23"
          dica="Padrão antigo ou Mercosul. O hífen é opcional."
          className="uppercase tracking-wide"
          erro={errors.placa?.message}
          {...register('placa')}
        />

        <div className="grid grid-cols-2 gap-3">
          <Campo
            rotulo="Marca"
            autoCapitalize="words"
            placeholder="Honda"
            autoComplete="off"
            erro={errors.marca?.message}
            {...register('marca')}
          />
          <Campo
            rotulo="Modelo"
            autoCapitalize="words"
            placeholder="CG 160"
            erro={errors.modelo?.message}
            {...register('modelo')}
          />
        </div>

        {/* Marcas na mão, e não num menu do navegador.
            A primeira versão usava <datalist>: no computador vira uma listinha
            discreta e no celular, quando aparece, é um alvo minúsculo — o
            contrário do que esta tela precisa, que é acertar com o dedo sujo.
            Aqui cada marca é um botão, e continua valendo digitar qualquer
            outra: a lista existe para "Hoda" e "HONDA" não virarem marcas
            diferentes na hora de procurar a moto depois. */}
        <div className="-mt-1 flex flex-wrap gap-2">
          {MARCAS_DE_MOTO.map((m) => {
            const escolhida = (watch('marca') ?? '').trim().toLowerCase() === m.toLowerCase()
            return (
              <button
                key={m}
                type="button"
                aria-pressed={escolhida}
                onClick={() =>
                  setValue('marca', escolhida ? '' : m, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                className={
                  escolhida
                    ? 'min-h-toque-fino rounded-badge bg-acento px-3 text-apoio font-medium text-em-superficie'
                    : 'min-h-toque-fino rounded-badge border border-borda-em-superficie px-3 text-apoio text-em-superficie-2 active:bg-fundo-2'
                }
              >
                {m}
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Campo
            rotulo="Ano"
            inputMode="numeric"
            placeholder="2022"
            erro={errors.ano?.message}
            {...register('ano')}
          />
          <Campo
            rotulo="Cor"
            autoCapitalize="words"
            placeholder="Preta"
            erro={errors.cor?.message}
            {...register('cor')}
          />
        </div>

        <Campo
          rotulo="Quilometragem"
          inputMode="numeric"
          placeholder="12000"
          dica="Como está no painel hoje."
          erro={errors.km_atual?.message}
          {...register('km_atual')}
        />

        <Campo
          rotulo="Chassi"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Opcional"
          erro={errors.chassi?.message}
          {...register('chassi')}
        />

        {errors.root && (
          <LinhaInteira>
            <p role="alert" className="rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro-forte">
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
            {editando ? 'Salvar alterações' : 'Cadastrar moto'}
          </Botao>
        </LinhaInteira>
      </Formulario>
    </Tela>
  )
}
