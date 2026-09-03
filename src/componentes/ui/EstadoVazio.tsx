import type { ReactNode } from 'react'
import { AlertTriangle, WifiOff } from 'lucide-react'
import { Botao } from './Botao'
import { cn } from '@/lib/cn'

interface Props {
  /** Opcional: dentro de uma folha de busca o círculo só ocupa espaço. */
  icone?: ReactNode
  titulo: string
  /** Convida à ação: "Cadastre a primeira." — nunca só "Sem resultados". */
  descricao: string
  rotuloAcao?: string
  aoAgir?: () => void
  /**
   * Está dentro de um card ou folha branca, e não sobre o fundo preto do app.
   *
   * Sem isto o título sai branco sobre branco e some — foi o que fez a folha de
   * "Escolher peça" parecer quebrada: aparecia só a linha cinza de baixo.
   */
  sobreClaro?: boolean
}

export function EstadoVazio({
  icone,
  titulo,
  descricao,
  rotuloAcao,
  aoAgir,
  sobreClaro = false,
}: Props) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icone && (
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-superficie-escura text-acento">
          {icone}
        </span>
      )}
      <h2 className={cn('text-secao', sobreClaro ? 'text-claro' : 'text-escuro')}>{titulo}</h2>
      <p
        className={cn(
          'max-w-[36ch] text-corpo',
          sobreClaro ? 'text-claro-secundario' : 'text-escuro-secundario',
        )}
      >
        {descricao}
      </p>
      {rotuloAcao && aoAgir && (
        <Botao onClick={aoAgir} className="mt-2">
          {rotuloAcao}
        </Botao>
      )}
    </div>
  )
}

/** Estado de erro: diz o que houve e o que fazer. */
export function EstadoErro({
  titulo = 'Não foi possível carregar',
  descricao = 'Verifique a conexão e tente de novo.',
  aoTentarDeNovo,
  sobreClaro = false,
}: {
  titulo?: string
  descricao?: string
  aoTentarDeNovo?: () => void
  sobreClaro?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-erro-fundo text-erro">
        <AlertTriangle aria-hidden size={28} />
      </span>
      <h2 className={cn('text-secao', sobreClaro ? 'text-claro' : 'text-escuro')}>{titulo}</h2>
      <p
        className={cn(
          'max-w-[36ch] text-corpo',
          sobreClaro ? 'text-claro-secundario' : 'text-escuro-secundario',
        )}
      >
        {descricao}
      </p>
      {aoTentarDeNovo && (
        <Botao onClick={aoTentarDeNovo} className="mt-2">
          Tentar de novo
        </Botao>
      )}
    </div>
  )
}

export function SemConexao({ aoTentarDeNovo }: { aoTentarDeNovo?: () => void }) {
  return (
    <EstadoErro
      titulo="Você está sem conexão"
      descricao="O aplicativo abriu, mas precisa de internet para carregar os dados da oficina. Assim que o sinal voltar, toque em tentar de novo."
      aoTentarDeNovo={aoTentarDeNovo}
    />
  )
}

export { WifiOff }
