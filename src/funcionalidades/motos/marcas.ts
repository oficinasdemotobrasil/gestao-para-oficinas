/**
 * As marcas de moto que aparecem no cadastro.
 *
 * É sugestão, não é lista fechada: o campo continua aceitando qualquer texto,
 * porque oficina conserta moto importada, marca antiga e coisa que ninguém
 * previu. O que a lista resolve é o erro de digitação — "Hoda", "YAMAHA" e
 * "yamaha" viram três marcas diferentes na hora de procurar a moto depois.
 *
 * A ordem é a do mercado brasileiro de motos, não alfabética: Honda e Yamaha
 * são a maior parte de tudo que entra numa oficina, e ficam ao alcance do
 * primeiro toque.
 */
export const MARCAS_DE_MOTO = [
  'Honda',
  'Yamaha',
  'Shineray',
  'Haojue',
  'Dafra',
  'Suzuki',
  'Bajaj',
  'Royal Enfield',
  'Kawasaki',
  'BMW',
  'Harley-Davidson',
  'Triumph',
] as const
