import { useQuery } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { EsqueletoLista } from '@/componentes/ui/Carregando'
import { nomeDoPerfil } from '@/auth/usePermissoes'
import { listarColaboradores } from '@/funcionalidades/colaboradores/api'

/**
 * A equipe ativa, para escolher um. Existe como componente porque a mesma
 * escolha aparece ao aprovar um orçamento e ao (re)atribuir uma ordem — e duas
 * cópias da mesma lista viram duas listas diferentes com o tempo.
 */
export function ListaDeColaboradores({
  escolhidoId,
  aoEscolher,
  ativa = true,
}: {
  escolhidoId: string | null
  aoEscolher: (id: string) => void
  /** Só busca quando a folha está aberta: fechada, seria uma ida à toa. */
  ativa?: boolean
}) {
  const { data, isPending } = useQuery({
    queryKey: ['colaboradores'],
    queryFn: listarColaboradores,
    enabled: ativa,
  })

  if (isPending) return <EsqueletoLista linhas={3} sobreClaro />

  const ativos = (data ?? []).filter((c) => c.ativo)

  return (
    <div className="flex flex-col gap-2 pb-2">
      {ativos.map((c) => {
        const escolhido = c.id === escolhidoId
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => aoEscolher(c.id)}
            aria-pressed={escolhido}
            className={`flex min-h-toque items-center justify-between gap-3 rounded-controle border px-4 py-3 text-left ${
              escolhido ? 'border-acento bg-acento-suave' : 'border-borda-clara bg-transparent'
            }`}
          >
            <span className="min-w-0">
              <span className="block truncate text-corpo font-medium text-claro">{c.nome}</span>
              <span className="block text-apoio text-claro-secundario">
                {nomeDoPerfil[c.perfil]}
              </span>
            </span>
            {escolhido && <CheckCircle2 aria-hidden size={22} className="shrink-0 text-acento" />}
          </button>
        )
      })}
    </div>
  )
}
