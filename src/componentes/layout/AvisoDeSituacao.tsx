import { Lock } from 'lucide-react'
import { useAuth } from '@/auth/ProvedorAuth'

/**
 * Faixa fixa no topo quando a oficina está suspensa ou cancelada.
 *
 * A escolha do produto é só leitura: os dados são da oficina, e tirar dela o
 * histórico dos próprios clientes por causa de uma fatura em atraso
 * transformaria uma cobrança em refém. O que ela perde é registrar coisa nova.
 *
 * O aviso existe porque, sem ele, a pessoa descobriria a suspensão pelo erro ao
 * salvar — depois de digitar o orçamento inteiro. Melhor dizer antes.
 */
export function AvisoDeSituacao() {
  const { oficina } = useAuth()
  if (!oficina || oficina.status === 'ativa') return null

  const cancelada = oficina.status === 'cancelada'

  return (
    <div
      role="status"
      className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-erro px-4 py-2 text-center text-escuro"
    >
      <Lock aria-hidden size={16} className="shrink-0" />
      <span className="text-apoio font-medium">
        {cancelada
          ? 'Esta conta foi encerrada. Você continua consultando o histórico, mas não é possível registrar nada.'
          : 'Conta suspensa. Você continua consultando tudo, mas só volta a registrar depois de regularizar.'}
      </span>
    </div>
  )
}
