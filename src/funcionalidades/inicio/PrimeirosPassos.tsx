/**
 * A lista curta do que fazer nos primeiros dez minutos.
 *
 * O progresso é CALCULADO do que existe no banco — tem serviço cadastrado?
 * tem produto? já fez um orçamento? — e não guardado passo a passo. Guardar
 * daria o defeito clássico dessas listas: dizer "falta cadastrar serviço" para
 * quem já tem trinta, porque alguém esqueceu de marcar a caixinha.
 *
 * Some sozinha quando os cinco estão feitos. Dá para dispensar antes, e aí
 * continua acessível em Configurações — dispensar é preferência, não conclusão.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/ProvedorAuth'
import { useToast } from '@/componentes/ui/Toast'
import { traduzirErro } from '@/lib/erros'

type Passos = {
  dados_da_oficina: boolean
  logo: boolean
  primeiro_servico: boolean
  primeiro_produto: boolean
  primeiro_orcamento: boolean
  ocultos: boolean
}

const ROTEIRO: { chave: keyof Passos; texto: string; para: string }[] = [
  { chave: 'dados_da_oficina', texto: 'Complete os dados da oficina', para: '/configuracoes' },
  { chave: 'logo', texto: 'Suba o seu logo', para: '/configuracoes' },
  { chave: 'primeiro_servico', texto: 'Cadastre o primeiro serviço', para: '/servicos' },
  { chave: 'primeiro_produto', texto: 'Cadastre o primeiro produto', para: '/catalogo' },
  { chave: 'primeiro_orcamento', texto: 'Faça o primeiro orçamento', para: '/orcamentos/novo' },
]

export function PrimeirosPassos() {
  const { oficina } = useAuth()
  const navegar = useNavigate()
  const toast = useToast()
  const fila = useQueryClient()

  const passos = useQuery({
    queryKey: ['primeiros-passos', oficina?.id],
    enabled: Boolean(oficina),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('primeiros_passos')
      if (error) throw error
      return data as unknown as Passos
    },
  })

  const dispensar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('oficinas')
        .update({ primeiros_passos_ocultos: true })
        .eq('id', oficina!.id)
      if (error) throw error
    },
    onSuccess: () => fila.invalidateQueries({ queryKey: ['primeiros-passos'] }),
    onError: (e) => toast.erro(traduzirErro(e)),
  })

  const p = passos.data
  if (!p || p.ocultos) return null

  const feitos = ROTEIRO.filter(({ chave }) => p[chave]).length
  if (feitos === ROTEIRO.length) return null

  return (
    <div className="mt-3 rounded-card bg-superficie p-4 tablet:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-secao text-claro">Comece por aqui</p>
          <p className="text-apoio text-claro-secundario">
            {feitos} de {ROTEIRO.length} — leva uns dez minutos
          </p>
        </div>
        <button
          type="button"
          onClick={() => dispensar.mutate()}
          aria-label="Dispensar a lista de primeiros passos"
          className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-claro-secundario active:bg-borda-clara/40"
        >
          <X aria-hidden size={18} />
        </button>
      </div>

      {/* A barra é decorativa: o número acima já diz o mesmo em palavras. */}
      <div aria-hidden className="mt-3 h-2 overflow-hidden rounded-full bg-borda-clara">
        <div
          className="h-full rounded-full bg-acento transition-[width] duration-padrao ease-padrao"
          style={{ width: `${(feitos / ROTEIRO.length) * 100}%` }}
        />
      </div>

      <ul className="mt-3 flex flex-col">
        {ROTEIRO.map(({ chave, texto, para }) => {
          const feito = p[chave]
          return (
            <li key={chave}>
              <button
                type="button"
                disabled={feito}
                onClick={() => navegar(para)}
                className={[
                  'flex w-full items-center gap-3 rounded-controle py-2 text-left',
                  feito ? 'cursor-default' : 'active:bg-borda-clara/40',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                    feito ? 'border-sucesso bg-sucesso text-superficie' : 'border-borda-clara',
                  ].join(' ')}
                >
                  {feito && <Check aria-hidden size={14} strokeWidth={3} />}
                </span>
                <span
                  className={[
                    'text-corpo',
                    feito ? 'text-claro-secundario line-through' : 'text-claro',
                  ].join(' ')}
                >
                  {texto}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <p className="pt-2 text-apoio text-claro-secundario">
        Sem catálogo ainda? Em Configurações dá para carregar peças e serviços de
        exemplo e apagar depois.
      </p>
    </div>
  )
}
