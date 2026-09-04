import { cn } from '@/lib/cn'

export interface Aba<T extends string> {
  id: T
  rotulo: string
}

interface Props<T extends string> {
  abas: ReadonlyArray<Aba<T>>
  ativa: T
  aoTrocar: (id: T) => void
  /** Para o leitor de tela saber do que é este grupo de abas. */
  rotulo: string
}

/**
 * Abas dentro de uma tela, para não gastar lugar na tab bar — que tem cinco
 * vagas e nenhuma sobrando.
 *
 * Cada aba ocupa a mesma largura e tem a altura mínima de toque: com três abas
 * numa tela de 375px, sobra pouco, e alvo pequeno com a mão suja não funciona.
 */
export function Abas<T extends string>({ abas, ativa, aoTrocar, rotulo }: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={rotulo}
      className="flex gap-1 rounded-controle bg-superficie-escura p-1"
    >
      {abas.map(({ id, rotulo: texto }) => (
        <button
          key={id}
          role="tab"
          type="button"
          aria-selected={ativa === id}
          onClick={() => aoTrocar(id)}
          className={cn(
            'min-h-toque flex-1 rounded-[10px] px-1 text-corpo font-medium',
            // No desktop as abas param de dividir a largura em partes iguais e
            // passam a ocupar o tamanho do texto: elas ficam ao lado da busca,
            // num espaço que sobra, e esticadas viravam quatro botões colados
            // com a palavra encostando na borda.
            'desktop:min-h-toque-fino desktop:flex-none desktop:px-4',
            'transition-colors duration-padrao ease-padrao',
            ativa === id ? 'bg-acento text-claro' : 'text-escuro-secundario',
          )}
        >
          {texto}
        </button>
      ))}
    </div>
  )
}
