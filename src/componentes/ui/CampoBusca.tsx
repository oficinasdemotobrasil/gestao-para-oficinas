import { Search, X } from 'lucide-react'

interface Props {
  valor: string
  aoMudar: (valor: string) => void
  placeholder: string
  /** Deixa o teclado do celular no formato certo (placa vira maiúscula). */
  autoCapitalize?: 'none' | 'characters'
  inputMode?: 'text' | 'search' | 'numeric'
  rotulo: string
}

export function CampoBusca({
  valor,
  aoMudar,
  placeholder,
  autoCapitalize = 'none',
  inputMode = 'search',
  rotulo,
}: Props) {
  return (
    <div className="relative">
      <Search
        aria-hidden
        size={20}
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-claro-secundario"
      />
      <input
        type="search"
        aria-label={rotulo}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        autoCapitalize={autoCapitalize}
        autoCorrect="off"
        spellCheck={false}
        inputMode={inputMode}
        className="h-campo w-full rounded-controle border border-transparent bg-superficie pl-12 pr-11 text-corpo text-claro placeholder:text-claro-secundario focus:border-acento [&::-webkit-search-cancel-button]:hidden"
      />
      {valor && (
        <button
          type="button"
          onClick={() => aoMudar('')}
          aria-label="Limpar busca"
          className="absolute right-1 top-1/2 flex h-toque w-toque -translate-y-1/2 items-center justify-center text-claro-secundario"
        >
          <X aria-hidden size={18} />
        </button>
      )}
    </div>
  )
}
