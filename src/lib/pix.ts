/**
 * O código PIX gerado aqui dentro, sem servidor e sem API de terceiro.
 *
 * O BR Code é o padrão EMV®QRCPS do Banco Central: uma sequência de campos no
 * formato "id + tamanho + valor", com um CRC no fim. Nada nele é segredo nem
 * exige autenticação — é o mesmo código que o app do banco imprime. Por isso
 * não há custo por cobrança, e funciona com a internet da oficina caindo.
 *
 * O CRC é a parte que não perdoa: um dígito errado e o app do banco recusa o
 * código sem dizer por quê. Ele é conferido em teste contra o exemplo oficial
 * do Banco Central — veja scripts/teste-pix.ts.
 */

export type TipoChavePix = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria'

/** "id + tamanho em dois dígitos + valor". O tamanho conta BYTES, não letras. */
function campo(id: string, valor: string): string {
  const tamanho = new TextEncoder().encode(valor).length
  return `${id}${String(tamanho).padStart(2, '0')}${valor}`
}

/**
 * CRC16-CCITT (FALSE): polinômio 0x1021, valor inicial 0xFFFF, sem reflexão e
 * sem OU-exclusivo final. É a variante que o Banco Central especifica — as
 * outras dão um número diferente e o código não abre.
 */
export function crc16(texto: string): string {
  const bytes = new TextEncoder().encode(texto)
  let crc = 0xffff

  for (const byte of bytes) {
    crc ^= byte << 8
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/**
 * Tira acento e o que não for letra, número ou espaço.
 *
 * O padrão aceita só um subconjunto do ASCII nos campos de nome e cidade. Com
 * "Oficina do Zé — Ação", parte dos bancos mostra caracteres trocados e parte
 * simplesmente não lê o código.
 */
function semAcento(texto: string, limite: number): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, limite)
    .trim()
    .toUpperCase()
}

/** A chave no formato que o BR Code espera, por tipo. */
export function formatarChavePix(chave: string, tipo: TipoChavePix): string {
  const limpa = chave.trim()
  const digitos = limpa.replace(/\D/g, '')

  switch (tipo) {
    case 'cpf':
    case 'cnpj':
      // Só os números: o banco recusa a chave com ponto e traço.
      return digitos
    case 'telefone':
      // Padrão internacional, com o +55 na frente.
      if (digitos.length === 10 || digitos.length === 11) return `+55${digitos}`
      if (digitos.length === 12 || digitos.length === 13) return `+${digitos}`
      return limpa
    case 'email':
      return limpa.toLowerCase()
    case 'aleatoria':
      return limpa.toLowerCase()
  }
}

/** Diz se a chave cadastrada tem cara do tipo que a oficina escolheu. */
export function chavePixValida(chave: string, tipo: TipoChavePix): boolean {
  const limpa = chave.trim()
  const digitos = limpa.replace(/\D/g, '')

  switch (tipo) {
    case 'cpf':
      return digitos.length === 11
    case 'cnpj':
      return digitos.length === 14
    case 'telefone':
      return digitos.length >= 10 && digitos.length <= 13
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpa)
    case 'aleatoria':
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(limpa)
  }
}

export interface CobrancaPix {
  chave: string
  tipoDaChave: TipoChavePix
  nomeDoRecebedor: string
  cidade: string
  /** Em reais. Zero ou nulo gera código sem valor, e o cliente digita quanto vai pagar. */
  valor?: number | null
  /**
   * Identificador da cobrança, até 25 caracteres. O padrão manda "***" quando
   * não há um — e é o que a maioria dos bancos espera num código estático.
   */
  identificador?: string | null
}

/**
 * Monta o BR Code estático (copia e cola).
 *
 * Estático quer dizer que ele não avisa ninguém quando é pago: quem confere o
 * recebimento é a pessoa, no extrato do banco. É por isso que a baixa no
 * aplicativo é manual — e a tela diz isso com todas as letras.
 */
export function gerarBrCode(cobranca: CobrancaPix): string {
  const chave = formatarChavePix(cobranca.chave, cobranca.tipoDaChave)
  const nome = semAcento(cobranca.nomeDoRecebedor, 25) || 'RECEBEDOR'
  const cidade = semAcento(cobranca.cidade, 15) || 'BRASIL'

  const identificador = semAcento(cobranca.identificador ?? '', 25).replace(/ /g, '')
  const txid = identificador || '***'

  const partes = [
    campo('00', '01'),
    // Em minúsculo, como no manual do Banco Central. O padrão EMV diz que este
    // identificador não diferencia maiúscula de minúscula, mas o exemplo oficial
    // (o mesmo que o teste confere) é minúsculo — e leitor rígido existe.
    campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', chave)),
    campo('52', '0000'),
    campo('53', '986'),
  ]

  if (cobranca.valor && cobranca.valor > 0) {
    // Sempre com duas casas e ponto decimal: o padrão não aceita vírgula.
    partes.push(campo('54', cobranca.valor.toFixed(2)))
  }

  partes.push(campo('58', 'BR'), campo('59', nome), campo('60', cidade))
  partes.push(campo('62', campo('05', txid)))

  // O CRC é calculado sobre tudo o que veio antes, INCLUINDO "6304".
  const semCrc = `${partes.join('')}6304`
  return `${semCrc}${crc16(semCrc)}`
}
