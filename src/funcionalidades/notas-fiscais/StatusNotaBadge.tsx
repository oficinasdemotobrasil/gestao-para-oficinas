import { Badge } from '@/componentes/ui/Badge'
import type { StatusNota } from '@/tipos/banco'

const aparencia: Record<StatusNota, { rotulo: string; tom: 'sucesso' | 'erro' | 'neutro' }> = {
  lancada: { rotulo: 'Lançada', tom: 'sucesso' },
  cancelada: { rotulo: 'Cancelada', tom: 'erro' },
}

export function StatusNotaBadge({ status }: { status: StatusNota }) {
  const { rotulo, tom } = aparencia[status]
  return <Badge tom={tom}>{rotulo}</Badge>
}
