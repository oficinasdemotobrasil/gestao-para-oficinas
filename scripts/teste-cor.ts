/**
 * Confere a matemática do contraste da cor da marca.
 *
 * Este teste existe porque o erro aqui é silencioso: uma cor mal escolhida não
 * quebra nada, não dá erro nenhum — ela só deixa o app ilegível para quem já
 * enxerga mal, e ninguém reclama, a pessoa só desiste de usar.
 *
 * Começa por casos que a WCAG define com número fechado, para provar a conta
 * antes de julgar qualquer cor nossa.
 *
 *   npm run teste:cor
 */
import {
  corLegivelSobreClaro,
  PALETA,
  COR_DO_PRODUTO,
  CONTRASTE_MINIMO,
  avaliarCor,
  contraste,
  corMaisProximaQuePassa,
  luminancia,
  tonsDoAcento,
  paraHsl,
  deHsl,
  ehHexadecimal,
} from '../src/lib/cor'

let passou = 0
let falhou = 0
const ok = (n: string, d = '') => { passou++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? ` (${d})` : ''}`) }
const erro = (n: string, d: string) => { falhou++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`) }
const perto = (a: number, b: number, folga = 0.01) => Math.abs(a - b) <= folga

console.log('\n\x1b[1mA conta, contra valores que a WCAG define\x1b[0m')

perto(contraste('#ffffff', '#000000'), 21)
  ? ok('branco sobre preto dá 21:1', 'o teto da escala')
  : erro('extremo da escala', `deu ${contraste('#ffffff', '#000000').toFixed(2)}, esperava 21`)

perto(contraste('#777777', '#777777'), 1)
  ? ok('uma cor contra ela mesma dá 1:1', 'o piso da escala')
  : erro('piso da escala', `deu ${contraste('#777777', '#777777').toFixed(2)}`)

perto(luminancia('#ffffff'), 1) && perto(luminancia('#000000'), 0)
  ? ok('a luminância vai de 0 no preto a 1 no branco')
  : erro('luminância', `preto ${luminancia('#000000')}, branco ${luminancia('#ffffff')}`)

// #767676 sobre branco é o exemplo que a própria WCAG cita como o cinza mais
// escuro que ainda reprova por pouco na régua de 4.5 — bom para pegar erro de
// arredondamento que um caso extremo não pega.
perto(contraste('#767676', '#ffffff'), 4.54, 0.02)
  ? ok('o caso limite do cinza médio bate', '#767676 sobre branco ≈ 4.54:1')
  : erro('caso limite', `deu ${contraste('#767676', '#ffffff').toFixed(2)}, esperava ≈4.54`)

contraste('#f5c518', '#111113') === contraste('#111113', '#f5c518')
  ? ok('a ordem das cores não muda o resultado')
  : erro('simetria', 'inverter as cores mudou o contraste')

console.log('\n\x1b[1mAs oito cores prontas\x1b[0m')

for (const { nome, hex } of PALETA) {
  const a = avaliarCor(hex)
  a.aprovada
    ? ok(
        `${nome} passa nas duas`,
        `botão ${a.comoFundoDeBotao.toFixed(1)}:1 · texto ${a.comoTexto.toFixed(1)}:1`,
      )
    : erro(
        `${nome} (${hex})`,
        `botão ${a.comoFundoDeBotao.toFixed(2)}:1, texto ${a.comoTexto.toFixed(2)}:1 — mínimo ${CONTRASTE_MINIMO}`,
      )
}

new Set(PALETA.map((c) => c.hex)).size === PALETA.length && PALETA.length === 8
  ? ok('são oito, sem repetida')
  : erro('paleta', `${PALETA.length} cores, ${new Set(PALETA.map((c) => c.hex)).size} distintas`)

PALETA.every((c) => ehHexadecimal(c.hex) && c.hex === c.hex.toLowerCase())
  ? ok('todas em hexadecimal minúsculo, como o banco exige')
  : erro('formato', 'alguma cor não está no formato que a trava do banco aceita')

PALETA[0].hex === COR_DO_PRODUTO
  ? ok('a primeira é o amarelo do produto', 'quem não escolhe, fica com ele')
  : erro('primeira cor', 'a paleta não começa pela cor do produto')

console.log('\n\x1b[1mCores ruins e a sugestão que entra no lugar\x1b[0m')

// Um azul-marinho: bonito, e ilegível como texto sobre fundo escuro.
const marinho = '#1e3a8a'
!avaliarCor(marinho).aprovada
  ? ok('azul-marinho é recusado', `como texto dá só ${avaliarCor(marinho).comoTexto.toFixed(1)}:1`)
  : erro('azul-marinho', 'passou, e não deveria')

for (const ruim of ['#1e3a8a', '#7f1d1d', '#000000', '#3f3f46', '#4c1d95']) {
  const sugerida = corMaisProximaQuePassa(ruim)
  if (!sugerida) {
    erro(`sugestão para ${ruim}`, 'não achou nenhuma cor que passe')
    continue
  }
  const a = avaliarCor(sugerida)
  const tomIgual = ruim === '#000000' || perto(paraHsl(ruim).h, paraHsl(sugerida).h, 0.001)
  a.aprovada && tomIgual
    ? ok(`${ruim} vira ${sugerida}`, 'mesmo tom, agora legível')
    : erro(`sugestão para ${ruim}`, `${sugerida} — aprovada ${a.aprovada}, mesmo tom ${tomIgual}`)
}

corMaisProximaQuePassa('#f5c518') === '#f5c518'
  ? ok('cor que já passa é devolvida sem mexer')
  : erro('cor boa', 'a função alterou uma cor que já estava aprovada')

console.log('\n\x1b[1mOs três tons derivados de uma escolha só\x1b[0m')

for (const { nome, hex } of PALETA) {
  const t = tonsDoAcento(hex)
  const pressionadoEscurece = luminancia(t.pressionado) < luminancia(t.acento)
  // O tom suave é fundo de etiqueta, com o texto escuro do projeto por cima.
  const suaveLegivel = contraste(t.suave, '#111113') >= CONTRASTE_MINIMO
  const todosHexadecimais =
    ehHexadecimal(t.acento) && ehHexadecimal(t.pressionado) && ehHexadecimal(t.suave)
  pressionadoEscurece && suaveLegivel && todosHexadecimais
    ? ok(`${nome}: pressionado escurece e o suave aguenta texto escuro`)
    : erro(
        `tons de ${nome}`,
        `pressionado ${t.pressionado} escurece ${pressionadoEscurece}; suave ${t.suave} contra texto escuro ${contraste(t.suave, '#111113').toFixed(2)}:1`,
      )
}

console.log('\n\x1b[1mA mesma cor nos dois temas\x1b[0m')

// Os valores fixos do tokens.css também são medidos aqui: um token escrito à
// mão que deixa de passar é exatamente o defeito que ninguém vê.
const ACENTO_FORTE_DO_TOKENS_CSS = '#8a6a00'
contraste(ACENTO_FORTE_DO_TOKENS_CSS, '#f3f3f5') >= CONTRASTE_MINIMO &&
contraste(ACENTO_FORTE_DO_TOKENS_CSS, '#ffffff') >= CONTRASTE_MINIMO
  ? ok(
      'o acento-forte do tokens.css se lê no fundo e no cartão',
      `${contraste(ACENTO_FORTE_DO_TOKENS_CSS, '#f3f3f5').toFixed(1)}:1 e ${contraste(ACENTO_FORTE_DO_TOKENS_CSS, '#ffffff').toFixed(1)}:1`,
    )
  : erro('acento-forte fixo', ACENTO_FORTE_DO_TOKENS_CSS)

// O tema claro é onde o amarelo some. Cada cor da paleta precisa de uma versão
// que se leia sobre o cinza claro — senão o texto em destaque vira fantasma.
const FUNDO_CLARO = '#f3f3f5'

perto(contraste('#f5c518', FUNDO_CLARO), 1.47, 0.02)
  ? ok('o amarelo do produto some sobre o fundo claro', `${contraste('#f5c518', FUNDO_CLARO).toFixed(1)}:1 — é por isso que existe a versão forte`)
  : erro('premissa do tema claro', `deu ${contraste('#f5c518', FUNDO_CLARO).toFixed(2)}:1`)

for (const { nome, hex } of PALETA) {
  const forte = corLegivelSobreClaro(hex)
  const razao = contraste(forte, FUNDO_CLARO)
  const mesmoTom = perto(paraHsl(hex).h, paraHsl(forte).h, 0.001)
  razao >= CONTRASTE_MINIMO && mesmoTom
    ? ok(`${nome} tem versão legível no tema claro`, `${forte} · ${razao.toFixed(1)}:1, mesmo tom`)
    : erro(`${nome} no tema claro`, `${forte} deu ${razao.toFixed(2)}:1, mesmo tom ${mesmoTom}`)
}

// E o caminho de volta: a versão forte não pode ser usada como fundo de botão.
const forteDoAmarelo = corLegivelSobreClaro('#f5c518')
forteDoAmarelo !== '#f5c518'
  ? ok('a versão forte é diferente da cor escolhida', 'uma pinta o botão, a outra escreve')
  : erro('versão forte', 'devolveu a mesma cor')

// Uma cor que já se lê sobre o claro é devolvida sem mexer.
corLegivelSobreClaro('#8a6a00') === '#8a6a00'
  ? ok('cor que já se lê no claro passa intacta')
  : erro('cor escura', 'a função alterou uma cor que já servia')

console.log('\n\x1b[1mIda e volta entre formatos\x1b[0m')

const ida = PALETA.every(({ hex }) => deHsl(paraHsl(hex)).toLowerCase() === hex)
ida ? ok('hexadecimal → HSL → hexadecimal devolve a mesma cor')
    : erro('conversão', 'alguma cor não volta igual depois de converter')

console.log(`\n\x1b[1mResultado:\x1b[0m ${passou} passaram, ${falhou} falharam`)
process.exit(falhou > 0 ? 1 : 0)
