import { useSearchParams } from 'react-router-dom'
import { Tela, CabecalhoTela } from '@/componentes/layout/Tela'
import { Abas } from '@/componentes/ui/Abas'
import { ListaNotasEntrada } from './ListaNotasEntrada'
import { ListaNotasSaida } from './ListaNotasSaida'

const tipos = [
  { id: 'entrada', rotulo: 'Entrada' },
  { id: 'saida', rotulo: 'Saída' },
] as const

type Tipo = (typeof tipos)[number]['id']

/**
 * Notas fiscais: uma seção só, entrada e saída em abas.
 *
 * Nasceram como duas entradas separadas no menu, e isso estava errado por
 * dois motivos: ocupava duas vagas de navegação para a mesma ideia, e
 * obrigava a voltar ao menu para trocar de lado — quando na prática quem
 * está conferindo nota confere as duas na mesma sentada.
 *
 * Qual aba está aberta vive na URL (?tipo=saida), não em estado de tela: é
 * o que permite mandar um link direto para o lado certo, e é o que faz o
 * botão "voltar" do navegador se comportar como a pessoa espera depois de
 * abrir uma nota e voltar.
 */
export function NotasFiscais() {
  const [parametros, definirParametros] = useSearchParams()
  const tipo: Tipo = parametros.get('tipo') === 'saida' ? 'saida' : 'entrada'

  return (
    <Tela>
      <CabecalhoTela
        titulo="Notas fiscais"
        contexto={tipo === 'entrada' ? 'Compras da oficina' : 'Vendas da oficina'}
      />

      <div className="pb-4">
        <Abas
          rotulo="Tipo de nota fiscal"
          abas={tipos}
          ativa={tipo}
          aoTrocar={(novo) => definirParametros(novo === 'entrada' ? {} : { tipo: novo }, { replace: true })}
        />
      </div>

      {tipo === 'entrada' ? <ListaNotasEntrada /> : <ListaNotasSaida />}
    </Tela>
  )
}
