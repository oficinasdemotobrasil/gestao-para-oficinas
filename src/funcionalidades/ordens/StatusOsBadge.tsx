import { Badge } from '@/componentes/ui/Badge'
import type { StatusOS } from '@/tipos/banco'

const aparencia: Record<StatusOS, { rotulo: string; tom: 'sucesso' | 'atencao' | 'erro' | 'neutro' }> = {
  aberta: { rotulo: 'Aberta', tom: 'atencao' },
  em_andamento: { rotulo: 'Em andamento', tom: 'atencao' },
  pausada: { rotulo: 'Pausada', tom: 'neutro' },
  finalizada: { rotulo: 'Finalizada', tom: 'sucesso' },
  entregue: { rotulo: 'Entregue', tom: 'sucesso' },
  cancelada: { rotulo: 'Cancelada', tom: 'erro' },
}

export function StatusOsBadge({ status }: { status: StatusOS }) {
  const { rotulo, tom } = aparencia[status]
  return <Badge tom={tom}>{rotulo}</Badge>
}

export const rotuloDoStatusOs = (s: StatusOS) => aparencia[s].rotulo
