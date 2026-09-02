import { useEffect, useState, type ReactNode } from 'react'
import { Modal } from './Modal'
import { CampoBusca } from './CampoBusca'
import { ListaCard, LinhaLista } from './Card'
import { Botao } from './Botao'
import { EstadoVazio, EstadoErro } from './EstadoVazio'
import { EsqueletoLista } from './Carregando'
import { useDebounce } from '@/lib/useDebounce'

export interface OpcaoDeBusca {
  id: string
  titulo: string
  descricao?: string
  inicio?: ReactNode
  fim?: ReactNode
}

interface Props {
  aberto: boolean
  aoFechar: () => void
  titulo: string
  placeholder: string
  /** Busca no servidor, refeita a cada digitação (com folga). */
  buscar: (termo: string) => Promise<OpcaoDeBusca[]>
  aoEscolher: (id: string) => void
  /** Atalho para cadastrar sem sair do fluxo. */
  rotuloCriar?: string
  aoCriar?: () => void
  vazio: { titulo: string; descricao: string }
  autoCapitalize?: 'none' | 'characters'
}

/**
 * Folha que sobe para escolher um registro, com busca.
 *
 * Existe para o orçamento não virar uma sequência de telas: escolher cliente,
 * moto ou peça acontece por cima do que já está sendo montado, e o que já foi
 * digitado continua ali atrás. Com a moto na frente e o cliente esperando, cada
 * tela a menos conta.
 */
export function FolhaDeBusca({
  aberto,
  aoFechar,
  titulo,
  placeholder,
  buscar,
  aoEscolher,
  rotuloCriar,
  aoCriar,
  vazio,
  autoCapitalize = 'none',
}: Props) {
  const [termo, setTermo] = useState('')
  const termoAtrasado = useDebounce(termo)
  const [opcoes, setOpcoes] = useState<OpcaoDeBusca[] | null>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    if (!aberto) return
    let ativo = true
    setErro(false)
    setOpcoes(null)
    buscar(termoAtrasado)
      .then((r) => ativo && setOpcoes(r))
      .catch(() => ativo && setErro(true))
    return () => {
      ativo = false
    }
  }, [aberto, termoAtrasado, buscar])

  useEffect(() => {
    if (aberto) setTermo('')
  }, [aberto])

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={titulo}
      rodape={
        rotuloCriar && aoCriar ? (
          <Botao largo variante="contorno-no-card" onClick={aoCriar}>
            {rotuloCriar}
          </Botao>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3 pb-2">
        <CampoBusca
          rotulo={titulo}
          valor={termo}
          aoMudar={setTermo}
          placeholder={placeholder}
          autoCapitalize={autoCapitalize}
        />

        {erro ? (
          <EstadoErro
            titulo="Não foi possível buscar"
            descricao="Verifique a conexão e digite de novo."
          />
        ) : opcoes === null ? (
          <EsqueletoLista linhas={3} />
        ) : opcoes.length === 0 ? (
          <EstadoVazio
            icone={null}
            titulo={termo ? 'Nada encontrado' : vazio.titulo}
            descricao={termo ? `Nenhum resultado para "${termo}".` : vazio.descricao}
          />
        ) : (
          <ListaCard className="border border-borda-clara shadow-none">
            {opcoes.map((o) => (
              <LinhaLista
                key={o.id}
                inicio={o.inicio}
                titulo={o.titulo}
                descricao={o.descricao}
                fim={o.fim}
                aoTocar={() => aoEscolher(o.id)}
              />
            ))}
          </ListaCard>
        )}
      </div>
    </Modal>
  )
}
