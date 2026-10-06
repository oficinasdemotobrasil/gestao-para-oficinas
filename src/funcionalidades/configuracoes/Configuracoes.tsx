import { lazy, Suspense, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { resolverZod } from '@/lib/formulario'
import { useMutation } from '@tanstack/react-query'
import { z } from 'zod'
import { Tela, CabecalhoInterno, TituloSecao } from '@/componentes/layout/Tela'
import { Campo, Selecao, AreaTexto } from '@/componentes/ui/Campo'
import { Botao } from '@/componentes/ui/Botao'
import { Formulario, LinhaInteira } from '@/componentes/ui/Formulario'
import { Carregando } from '@/componentes/ui/Carregando'
import { useToast } from '@/componentes/ui/Toast'
import { supabase } from '@/lib/supabase'
import { traduzirErro } from '@/lib/erros'
import { mascararTelefone } from '@/lib/formato'
import { useAuth } from '@/auth/ProvedorAuth'
import { chavePixValida } from '@/lib/pix'
import { cnpjValido, cpfValido } from '@/lib/documento'
import type { TipoChavePix } from '@/tipos/banco'
import { Marca } from './Marca'
import { Conta } from './Conta'
import { ComissaoPadrao } from './ComissaoPadrao'
import { Exemplos } from './Exemplos'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Aparencia } from './Aparencia'
import { ROTULO_DO_PERIODO, periodoDoEndereco } from './precos'

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
    cidade: opcional,
    // CPF ou CNPJ: muita oficina de bairro fatura no CPF do dono e não tem
    // empresa aberta. Exigir CNPJ deixaria essa gente sem conseguir assinar.
    //
    // A coluna continua se chamando `cnpj` no banco por compatibilidade — ela
    // existe desde a primeira migration e é lida pelo PDF, pela exportação e
    // pela cobrança. Renomear seria mexer em cinco lugares para ganhar um nome
    // melhor num só.
    //
    // E confere os dígitos verificadores: um número trocado na digitação só
    // apareceria na hora de pagar, recusado pelo provedor, longe deste campo.
    cnpj: opcional.superRefine((v, ctx) => {
      if (v === null) return
      const digitos = v.replace(/\D/g, '')
      if (digitos.length !== 11 && digitos.length !== 14) {
        ctx.addIssue({ code: 'custom', message: 'Informe um CPF (11 dígitos) ou um CNPJ (14 dígitos).' })
        return
      }
      if (digitos.length === 11 ? !cpfValido(digitos) : !cnpjValido(digitos)) {
        ctx.addIssue({
          code: 'custom',
          message: `Este ${digitos.length === 11 ? 'CPF' : 'CNPJ'} não confere. Algum número foi trocado na digitação?`,
        })
      }
    }),
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
  // Chave com a cara errada só falha na hora de cobrar, com o cliente na
  // frente — e aí ninguém sabe que o problema é o cadastro.
  .refine(
    (d) => !d.chave_pix || !d.tipo_chave_pix || chavePixValida(d.chave_pix, d.tipo_chave_pix),
    {
      path: ['chave_pix'],
      message: 'A chave não tem o formato do tipo escolhido. Confira antes de cobrar.',
    },
  )

/*
 * O cartão do certificado traz junto a biblioteca que abre o arquivo .pfx
 * (node-forge) — sozinha, maior que o resto do app inteiro. Importada aqui no
 * topo, ela descia para todo mundo que abria o site, inclusive quem só via a
 * página de vendas. Assim, desce quando esta tela abre, e só ela.
 */
const CertificadoDigital = lazy(() =>
  import('./CertificadoDigital').then((m) => ({ default: m.CertificadoDigital })),
)

type DadosOficina = z.input<typeof esquemaOficina>
/** O que sai do Zod, já convertido — é isto que chega no onSubmit. */
type DadosOficinaValidados = z.output<typeof esquemaOficina>

export function Configuracoes() {
  const { oficina, recarregarUsuario } = useAuth()
  const toast = useToast()

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<DadosOficina, unknown, DadosOficinaValidados>({
    resolver: resolverZod<DadosOficina, DadosOficinaValidados>(esquemaOficina),
    defaultValues: {
      nome: '',
      telefone: '',
      endereco: '',
      cnpj: '',
      cidade: '',
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
        cidade: oficina.cidade ?? '',
        tipo_chave_pix: oficina.tipo_chave_pix ?? '',
        chave_pix: oficina.chave_pix ?? '',
      })
    }
  }, [oficina, reset])

  const navegar = useNavigate()
  const [parametros, definirParametros] = useSearchParams()
  /** Veio do cadastro agora há pouco. Ver CriarConta. */
  const recemChegado = parametros.get('novo') === '1'
  /**
   * Veio do botão de compra da página de vendas. O provedor de pagamento
   * exige CPF ou CNPJ; sem ele, o campo ganha o foco e um aviso diz por quê.
   * Com ele, a seção de assinatura abre o pagamento sozinha (ver Assinatura).
   */
  const assinar = periodoDoEndereco(parametros.get('assinar'))
  const faltaDocumento = Boolean(assinar && oficina && !oficina.cnpj)
  /**
   * O provedor recusou o documento na hora de gerar a cobrança (ver
   * Assinatura). A pessoa volta para cá, com o erro no próprio campo; salvo
   * o documento certo, a escolha de como pagar abre de novo sozinha.
   */
  const documentoRecusado = Boolean(assinar && oficina?.cnpj && parametros.get('doc') === 'recusado')

  useEffect(() => {
    if (faltaDocumento) setFocus('cnpj')
  }, [faltaDocumento, setFocus])

  useEffect(() => {
    if (!documentoRecusado) return
    setError('cnpj', {
      message: 'O provedor de pagamento não aceitou este documento. Confira os números e salve de novo.',
    })
    setFocus('cnpj')
  }, [documentoRecusado, setError, setFocus])

  const salvar = useMutation({
    mutationFn: async (dados: DadosOficinaValidados) => {
      const { error } = await supabase
        .from('oficinas')
        .update(dados)
        .eq('id', oficina!.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await recarregarUsuario()
      toast.sucesso('Configurações salvas.')
      /*
       * Quem acabou de criar a conta cai aqui direto, porque é aqui que os
       * dados faltam. Salvou, acabou o motivo de estar nesta tela: o lugar
       * dela é o início, vendo o sistema, e não numa página de ajustes.
       *
       * A exceção é quem veio pagar: fica aqui, e com o CPF ou CNPJ salvo a
       * tela de pagamento abre logo abaixo — inclusive depois de corrigir um
       * documento que o provedor recusou.
       */
      if (assinar) {
        if (parametros.has('doc')) {
          const resto = new URLSearchParams(parametros)
          resto.delete('doc')
          definirParametros(resto, { replace: true, preventScrollReset: true })
        }
        return
      }
      if (recemChegado) navegar('/', { replace: true })
    },
    onError: (erro) => setError('root', { message: traduzirErro(erro) }),
  })

  if (!oficina) return <Carregando />

  return (
    <Tela>
      <CabecalhoInterno titulo="Configurações" contexto="Dados da oficina" />

      {assinar && (faltaDocumento || documentoRecusado) && (
        <p role="status" className="mb-4 rounded-controle bg-acento-suave px-4 py-3 text-corpo text-em-superficie">
          {documentoRecusado
            ? 'O provedor de pagamento não aceitou o CPF ou CNPJ cadastrado. '
            : `Falta um passo para pagar o plano ${ROTULO_DO_PERIODO[assinar].toLowerCase()}: `}
          {documentoRecusado ? 'Confira os números abaixo' : 'preencha o CPF ou o CNPJ abaixo'} e toque
          em <strong>Salvar configurações</strong>. Em seguida, a tela de pagamento abre.
        </p>
      )}

      <Formulario aoEnviar={handleSubmit((d) => salvar.mutate(d))}>
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
              dica="Telefone, endereço e cidade são o que falta para o passo “Complete os dados da oficina” ficar pronto."
              erro={errors.telefone?.message}
              value={field.value ?? ''}
              onChange={(e) => field.onChange(mascararTelefone(e.target.value))}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />

        <Campo
          rotulo="CNPJ ou CPF"
          inputMode="numeric"
          placeholder="Só os números"
          dica="Serve o CPF do dono se a oficina não tem empresa aberta. É exigido para assinar."
          erro={errors.cnpj?.message}
          {...register('cnpj')}
        />

        <LinhaInteira>
          <AreaTexto
            rotulo="Endereço"
            placeholder="Rua, número, bairro"
            erro={errors.endereco?.message}
            {...register('endereco')}
          />
        </LinhaInteira>

        <Campo
          rotulo="Cidade"
          autoCapitalize="words"
          placeholder="Recife"
          dica="Vai no código do PIX. Sem ela, alguns bancos recusam a cobrança."
          erro={errors.cidade?.message}
          {...register('cidade')}
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
            Salvar configurações
          </Botao>
        </LinhaInteira>
      </Formulario>

      <TituloSecao>Recebimento por PIX</TituloSecao>
      {/* Formulário próprio, e com aoEnviar: um <form> sem tratador recarrega a
          página quando alguém aperta Enter dentro dele, e o que estava digitado
          se perde. Os dois blocos salvam o mesmo cadastro. */}
      <Formulario aoEnviar={handleSubmit((d) => salvar.mutate(d))}>
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

        <LinhaInteira>
          <Campo
            rotulo="Chave PIX"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="A chave que a oficina usa para receber"
            dica="Ela vai aparecer na cobrança quando o recebimento entrar."
            erro={errors.chave_pix?.message}
            {...register('chave_pix')}
          />
        </LinhaInteira>

        <LinhaInteira className="tablet:flex tablet:justify-end">
          <Botao
            type="submit"
            largo
            compactoNoDesktop
            variante="secundario"
            carregando={salvar.isPending}
          >
            Salvar chave PIX
          </Botao>
        </LinhaInteira>
      </Formulario>

      <TituloSecao>A marca da oficina</TituloSecao>
      <Marca />

      <TituloSecao>Aparência</TituloSecao>
      <Aparencia />

      <TituloSecao>Exemplos para começar</TituloSecao>
      <Exemplos />

      <TituloSecao>Comissão dos indicadores</TituloSecao>
      <ComissaoPadrao />

      <TituloSecao>Certificado digital</TituloSecao>
      <Suspense fallback={<Carregando />}>
        <CertificadoDigital />
      </Suspense>

      <TituloSecao>Sua conta</TituloSecao>
      <Conta />
    </Tela>
  )
}
