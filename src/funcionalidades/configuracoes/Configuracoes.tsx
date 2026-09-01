import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { z } from 'zod'
import { Tela, CabecalhoInterno, TituloSecao } from '@/componentes/layout/Tela'
import { Campo, Selecao, AreaTexto } from '@/componentes/ui/Campo'
import { Botao } from '@/componentes/ui/Botao'
import { Carregando } from '@/componentes/ui/Carregando'
import { useToast } from '@/componentes/ui/Toast'
import { supabase } from '@/lib/supabase'
import { traduzirErro } from '@/lib/erros'
import { mascararTelefone } from '@/lib/formato'
import { useAuth } from '@/auth/ProvedorAuth'
import type { TipoChavePix } from '@/tipos/banco'

const opcional = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()

const esquemaOficina = z
  .object({
    nome: z.string().trim().min(2, 'Informe o nome da oficina.'),
    telefone: opcional,
    endereco: opcional,
    cnpj: opcional.refine(
      (v) => v === null || v.replace(/\D/g, '').length === 14,
      'CNPJ precisa de 14 dígitos.',
    ),
    tipo_chave_pix: z
      .string()
      .transform((v) => (v === '' ? null : (v as TipoChavePix)))
      .nullable(),
    chave_pix: opcional,
  })
  // Chave sem tipo (ou o contrário) gera cobrança que não funciona. Melhor
  // barrar aqui do que descobrir na hora de receber.
  .refine((d) => !(d.chave_pix && !d.tipo_chave_pix), {
    path: ['tipo_chave_pix'],
    message: 'Escolha o tipo da chave PIX.',
  })
  .refine((d) => !(d.tipo_chave_pix && !d.chave_pix), {
    path: ['chave_pix'],
    message: 'Informe a chave PIX.',
  })

type DadosOficina = z.input<typeof esquemaOficina>

export function Configuracoes() {
  const { oficina, recarregarUsuario } = useAuth()
  const toast = useToast()

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DadosOficina>({
    resolver: zodResolver(esquemaOficina),
    defaultValues: {
      nome: '',
      telefone: '',
      endereco: '',
      cnpj: '',
      tipo_chave_pix: '',
      chave_pix: '',
    },
  })

  useEffect(() => {
    if (oficina) {
      reset({
        nome: oficina.nome,
        telefone: oficina.telefone ?? '',
        endereco: oficina.endereco ?? '',
        cnpj: oficina.cnpj ?? '',
        tipo_chave_pix: oficina.tipo_chave_pix ?? '',
        chave_pix: oficina.chave_pix ?? '',
      })
    }
  }, [oficina, reset])

  const salvar = useMutation({
    mutationFn: async (bruto: DadosOficina) => {
      const dados = esquemaOficina.parse(bruto)
      const { error } = await supabase
        .from('oficinas')
        .update(dados)
        .eq('id', oficina!.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await recarregarUsuario()
      toast.sucesso('Configurações salvas.')
    },
    onError: (erro) => setError('root', { message: traduzirErro(erro) }),
  })

  if (!oficina) return <Carregando />

  return (
    <Tela>
      <CabecalhoInterno titulo="Configurações" contexto="Dados da oficina" />

      <form
        onSubmit={handleSubmit((d) => salvar.mutate(d))}
        noValidate
        className="flex flex-col gap-4 rounded-card bg-superficie p-5 shadow-card"
      >
        <Campo
          rotulo="Nome da oficina"
          obrigatorio
          autoCapitalize="words"
          erro={errors.nome?.message}
          {...register('nome')}
        />

        <Controller
          name="telefone"
          control={control}
          render={({ field }) => (
            <Campo
              rotulo="Telefone"
              type="tel"
              inputMode="numeric"
              placeholder="(11) 3333-4444"
              erro={errors.telefone?.message}
              value={field.value ?? ''}
              onChange={(e) => field.onChange(mascararTelefone(e.target.value))}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />

        <Campo
          rotulo="CNPJ"
          inputMode="numeric"
          placeholder="Só os números"
          erro={errors.cnpj?.message}
          {...register('cnpj')}
        />

        <AreaTexto
          rotulo="Endereço"
          placeholder="Rua, número, bairro, cidade"
          erro={errors.endereco?.message}
          {...register('endereco')}
        />

        {errors.root && (
          <p role="alert" className="rounded-controle bg-erro-fundo px-4 py-3 text-corpo text-erro">
            {errors.root.message}
          </p>
        )}

        <Botao type="submit" largo carregando={isSubmitting || salvar.isPending} className="mt-2">
          Salvar configurações
        </Botao>
      </form>

      <TituloSecao>Recebimento por PIX</TituloSecao>
      <div className="flex flex-col gap-4 rounded-card bg-superficie p-5 shadow-card">
        <Selecao
          rotulo="Tipo da chave"
          erro={errors.tipo_chave_pix?.message}
          {...register('tipo_chave_pix')}
        >
          <option value="">Sem chave cadastrada</option>
          <option value="cpf">CPF</option>
          <option value="cnpj">CNPJ</option>
          <option value="email">E-mail</option>
          <option value="telefone">Telefone</option>
          <option value="aleatoria">Chave aleatória</option>
        </Selecao>

        <Campo
          rotulo="Chave PIX"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="A chave que a oficina usa para receber"
          dica="Ela vai aparecer na cobrança quando o recebimento entrar, na Fase 3."
          erro={errors.chave_pix?.message}
          {...register('chave_pix')}
        />

        <Botao
          largo
          variante="secundario"
          carregando={salvar.isPending}
          onClick={handleSubmit((d) => salvar.mutate(d))}
        >
          Salvar chave PIX
        </Botao>
      </div>
    </Tela>
  )
}
