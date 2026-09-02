import { Badge } from '@/componentes/ui/Badge'
import type { StatusOrcamento } from '@/tipos/banco'

const aparencia: Record<
  StatusOrcamento,
  { rotulo: string; tom: 'sucesso' | 'atencao' | 'erro' | 'neutro' }
> = {
  rascunho: { rotulo: 'Rascunho', tom: 'neutro' },
  enviado: { rotulo: 'Enviado', tom: 'atencao' },
  aprovado: { rotulo: 'Aprovado', tom: 'sucesso' },
  recusado: { rotulo: 'Recusado', tom: 'erro' },
  expirado: { rotulo: 'Expirado', tom: 'erro' },
}

export function StatusOrcamentoBadge({ status }: { status: StatusOrcamento }) {
  const { rotulo, tom } = aparencia[status]
  return <Badge tom={tom}>{rotulo}</Badge>
}

export const rotuloDoStatus = (s: StatusOrcamento) => aparencia[s].rotulo
