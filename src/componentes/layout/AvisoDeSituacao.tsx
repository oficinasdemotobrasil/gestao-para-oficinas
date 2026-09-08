import { Lock, Clock, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/auth/ProvedorAuth'
import { diasAte } from '@/lib/formato'

/**
 * Faixa fixa no topo quando a situação da oficina exige aviso.
 *
 * Ela lê a situação CALCULADA (`minha_situacao`), não a coluna `status`: uma
 * oficina cujo prazo venceu ontem tem `status = 'ativa'` no banco e está em
 * carência na prática. Quem olhasse a coluna não avisaria ninguém.
 *
 * A escolha do produto é só leitura em vez de bloqueio total: os dados são da
 * oficina, e tirar dela o histórico dos próprios clientes por causa de uma
 * fatura em atraso transformaria uma cobrança em refém. O que ela perde é
 * registrar coisa nova.
 *
 * O aviso existe porque, sem ele, a pessoa descobriria o bloqueio pelo erro ao
 * salvar — depois de digitar o orçamento inteiro. Melhor dizer antes.
 */
export function AvisoDeSituacao() {
  const { oficina, situacao } = useAuth()
  if (!oficina || !situacao || situacao === 'ativa') return null

  const faltam = oficina.acesso_ate ? diasAte(oficina.acesso_ate) : null

  const avisos = {
    teste: {
      tom: 'bg-acento text-claro',
      Icone: Clock,
      texto:
        faltam === null
          ? 'Você está no período de teste.'
          : faltam <= 0
            ? 'Seu teste termina hoje.'
            : `Seu teste termina em ${faltam} ${faltam === 1 ? 'dia' : 'dias'}.`,
    },
    atrasada: {
      tom: 'bg-atencao text-claro',
      Icone: AlertTriangle,
      texto:
        'Pagamento em atraso. Você continua trabalhando normalmente, mas o acesso é bloqueado se não for regularizado.',
    },
    bloqueada: {
      tom: 'bg-erro text-escuro',
      Icone: Lock,
      texto:
        'Acesso bloqueado por falta de pagamento. Você continua consultando tudo e pode exportar seus dados, mas não dá para registrar nada.',
    },
    suspensa: {
      tom: 'bg-erro text-escuro',
      Icone: Lock,
      texto:
        'Conta suspensa. Você continua consultando tudo, mas só volta a registrar depois de regularizar.',
    },
    cancelada: {
      tom: 'bg-erro text-escuro',
      Icone: Lock,
      texto: 'Esta conta foi encerrada. Você ainda pode exportar seus dados.',
    },
  } as const

  const aviso = avisos[situacao as keyof typeof avisos]
  if (!aviso) return null
  const { Icone } = aviso

  return (
    <div
      role="status"
      // O recuo à esquerda é o mesmo do conteúdo: o menu lateral é fixo e fica
      // POR CIMA desta faixa, então sem ele o texto centralizado começa atrás
      // do menu e as primeiras letras somem. No celular não há menu, e o recuo
      // não existe.
      className={`sticky top-0 z-30 flex items-center justify-center gap-2 px-4 py-2 text-center tablet:pl-menu-estreito desktop:pl-menu ${aviso.tom}`}
    >
      <Icone aria-hidden size={16} className="shrink-0" />
      <span className="text-apoio font-medium">{aviso.texto}</span>
    </div>
  )
}
