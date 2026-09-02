import type { ReactNode } from 'react'
import { AlertTriangle, WifiOff } from 'lucide-react'
import { Botao } from './Botao'

interface Props {
  /** Opcional: dentro de uma folha de busca o círculo só ocupa espaço. */
  icone?: ReactNode
  titulo: string
  /** Convida à ação: "Cadastre a primeira." — nunca só "Sem resultados". */
  descricao: string
  rotuloAcao?: string
  aoAgir?: () => void
}

export function EstadoVazio({ icone, titulo, descricao, rotuloAcao, aoAgir }: Props) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icone && (
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-superficie-escura text-acento">
          {icone}
        </span>
      )}
      <h2 className="text-secao text-escuro">{titulo}</h2>
      <p className="max-w-[36ch] text-corpo text-escuro-secundario">{descricao}</p>
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
}: {
  titulo?: string
  descricao?: string
  aoTentarDeNovo?: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-erro-fundo text-erro">
        <AlertTriangle aria-hidden size={28} />
      </span>
      <h2 className="text-secao text-escuro">{titulo}</h2>
      <p className="max-w-[36ch] text-corpo text-escuro-secundario">{descricao}</p>
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
