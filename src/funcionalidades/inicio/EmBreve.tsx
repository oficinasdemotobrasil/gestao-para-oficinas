import { Hammer } from 'lucide-react'
import { Tela } from '@/componentes/layout/Tela'
import { CabecalhoInterno } from '@/componentes/layout/Tela'
import { EstadoVazio } from '@/componentes/ui/EstadoVazio'

/**
 * Espaço reservado para as telas de cadastro, que entram no próximo bloco
 * (clientes, motos, produtos, serviços, colaboradores e configurações).
 * Existe só para a navegação já funcionar de ponta a ponta.
 */
export function EmBreve({ titulo }: { titulo: string }) {
  return (
    <Tela>
      <CabecalhoInterno titulo={titulo} />
      <EstadoVazio
        icone={<Hammer aria-hidden size={28} />}
        titulo="Tela em construção"
        descricao="Este cadastro entra no próximo bloco da Fase 1."
      />
    </Tela>
  )
}
