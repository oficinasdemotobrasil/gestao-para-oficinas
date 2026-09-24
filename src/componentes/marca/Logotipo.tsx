/**
 * O logotipo do GIRO.
 *
 * O "O" da palavra não é uma letra: é o símbolo, um anel aberto com a seta que
 * fecha o giro. Por isso o logotipo é montado aqui, e não é uma imagem — numa
 * imagem, o tamanho do símbolo e o encaixe dele na palavra viram aproximação, e
 * é justamente esse encaixe que o handoff define ao milésimo:
 *
 *   - "GIR" em Archivo 900, entreletra -0,035em, entrelinha 1;
 *   - símbolo a 0,833 do tamanho da fonte;
 *   - encostado com -0,033em de margem, à esquerda e embaixo.
 *
 * As proporções estão todas em `em`, então o logotipo inteiro cresce e diminui
 * mudando só `tamanho`.
 *
 * As três versões previstas na identidade, e nenhuma além delas:
 *   - sobre preto: letras brancas, símbolo amarelo (o padrão daqui);
 *   - sobre amarelo e sobre branco: tudo preto (`mono`, herdando a cor do texto).
 *
 * Abaixo de 22px o handoff manda usar só o ícone — `TAMANHO_MINIMO` guarda isso.
 *
 * A cor do símbolo vem de `--cor-marca-simbolo`, e não do acento: o acento é a
 * cor DA OFICINA, e numa oficina de cor azul o GIRO azul não é mais o GIRO.
 * Esse token também vira preto no tema claro, porque amarelo sobre papel dá
 * 1,63:1 — a própria identidade proíbe.
 */

/** Abaixo disto a palavra não se lê: use `<Simbolo />` sozinho. */
export const TAMANHO_MINIMO = 22

/** O anel com a seta, na cor de quem chama (`currentColor`). */
export function Simbolo({
  tamanho,
  className,
  style,
}: {
  tamanho: number | string
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={tamanho}
      height={tamanho}
      aria-hidden
      focusable="false"
      className={className}
      style={style}
    >
      <path
        d="M31.2 25.4 A32 32 0 1 0 72 23.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="15"
      />
      <path d="M66 4 L92 20 L64 36 Z" fill="currentColor" />
    </svg>
  )
}

export function Logotipo({
  tamanho = 28,
  mono = false,
  className,
}: {
  /** Tamanho da fonte da palavra, em pixels. Mínimo 22. */
  tamanho?: number
  /** Tudo numa cor só, herdada do texto — para fundo amarelo ou branco. */
  mono?: boolean
  className?: string
}) {
  return (
    <span
      // O nome sai por extenso para quem usa leitor de tela: o símbolo é
      // decorativo e as três letras soltas seriam lidas como "G-I-R".
      role="img"
      aria-label="GIRO"
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: "'Archivo', var(--fonte)",
        fontWeight: 900,
        fontSize: `${Math.max(tamanho, TAMANHO_MINIMO)}px`,
        letterSpacing: '-0.035em',
        lineHeight: 1,
      }}
    >
      GIR
      <Simbolo
        tamanho="0.833em"
        // O kerning negativo encosta o símbolo na letra R, como faria o "O".
        style={{
          marginLeft: '-0.033em',
          marginBottom: '-0.033em',
          color: mono ? undefined : 'rgb(var(--cor-marca-simbolo))',
        }}
      />
    </span>
  )
}
