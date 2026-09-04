/**
 * Dois gráficos, escritos à mão em SVG.
 *
 * Sem biblioteca de propósito: as menores custam mais de 100 KB, e uma linha e
 * uma barra não valem isso no celular da oficina. SVG também escala sem borrar
 * e herda a cor do tema sem configuração.
 */
import { moeda } from '@/lib/formato'

/** Fatura por dia. Mostra o formato do mês, não o número exato de cada dia. */
export function LinhaDoPeriodo({
  pontos,
}: {
  pontos: Array<{ dia: string; valor: number }>
}) {
  if (pontos.length < 2) return null

  const valores = pontos.map((p) => Number(p.valor))
  const maior = Math.max(...valores)
  if (maior <= 0) {
    return (
      <p className="py-6 text-center text-corpo text-claro-secundario">
        Nenhum serviço concluído neste período.
      </p>
    )
  }

  const largura = 300
  const altura = 90
  const passo = largura / (pontos.length - 1)

  const caminho = valores
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * passo).toFixed(1)} ${(altura - (v / maior) * altura).toFixed(1)}`)
    .join(' ')

  // A área embaixo da linha fecha no rodapé do gráfico, para dar volume sem
  // precisar de eixo — que no celular só rouba espaço.
  const area = `${caminho} L ${largura} ${altura} L 0 ${altura} Z`

  return (
    <div className="pt-2">
      <svg
        viewBox={`0 0 ${largura} ${altura}`}
        className="h-24 w-full"
        role="img"
        aria-label={`Faturamento por dia. Maior dia: ${moeda(maior)}.`}
        preserveAspectRatio="none"
      >
        <path d={area} className="fill-acento/15" />
        <path
          d={caminho}
          fill="none"
          className="stroke-acento"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex justify-between pt-1 text-micro text-claro-secundario">
        <span>{moeda(0)}</span>
        <span>pico {moeda(maior)}</span>
      </div>
    </div>
  )
}

/** Barra única, dividida. Mostra proporção, que é o que importa aqui. */
export function BarraDeComposicao({
  partes,
}: {
  partes: Array<{ rotulo: string; valor: number; classe: string }>
}) {
  const total = partes.reduce((a, p) => a + p.valor, 0)
  if (total === 0) {
    return (
      <p className="py-4 text-center text-corpo text-claro-secundario">
        Nenhum orçamento neste período.
      </p>
    )
  }

  return (
    <div className="pt-2">
      <div className="flex h-3 w-full overflow-hidden rounded-badge">
        {partes.map((p) =>
          p.valor === 0 ? null : (
            <div
              key={p.rotulo}
              className={p.classe}
              style={{ width: `${(p.valor / total) * 100}%` }}
              title={`${p.rotulo}: ${p.valor}`}
            />
          ),
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-3">
        {partes.map((p) => (
          <span key={p.rotulo} className="flex items-center gap-1.5 text-apoio text-claro-secundario">
            <span className={`h-2.5 w-2.5 rounded-full ${p.classe}`} aria-hidden />
            {p.rotulo} {p.valor}
          </span>
        ))}
      </div>
    </div>
  )
}
