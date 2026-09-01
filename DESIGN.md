# Design — Gestão para Oficinas

Referência: **app nativo de iPhone**, tema escuro, acento amarelo forte. Não é dashboard
de web SaaS. O aparelho é um celular segurado com a mão suja, dentro da oficina.

Regra que não se quebra: **nenhum valor de cor, espaço, raio ou sombra escrito solto dentro
de componente.** A fonte única é `src/estilos/tokens.css`; o Tailwind apenas aponta para
essas variáveis (`tailwind.config.ts`). Se um valor não existe aqui, ele não entra no CSS.

---

## Cor

| Token CSS | Classe Tailwind | Valor | Uso |
|---|---|---|---|
| `--cor-fundo` | `bg-fundo` | `#0B0B0C` | fundo do app, sempre |
| `--cor-superficie` | `bg-superficie` | `#FFFFFF` | card principal, flutuando sobre o preto |
| `--cor-superficie-escura` | `bg-superficie-escura` | `#1A1A1C` | card secundário sobre fundo escuro |
| `--cor-borda-escura` | `border-borda-escura` | `#2A2A2E` | divisórias no escuro |
| `--cor-borda-clara` | `border-borda-clara` | `#E6E6E9` | divisórias dentro do card branco |
| `--cor-acento` | `bg-acento` / `text-acento` | `#F5C518` | ação principal, número em destaque, item ativo |
| `--cor-acento-pressionado` | `active:bg-acento-pressionado` | `#DCAF10` | estado pressionado |
| `--cor-acento-suave` | `bg-acento-suave` | `#FDF3CC` | fundo de ícone ilustrativo dentro do card branco |
| `--cor-texto-claro` | `text-claro` | `#111113` | texto sobre branco/amarelo |
| `--cor-texto-claro-secundario` | `text-claro-secundario` | `#6B6B70` | apoio sobre branco |
| `--cor-texto-escuro` | `text-escuro` | `#FFFFFF` | texto sobre preto |
| `--cor-texto-escuro-secundario` | `text-escuro-secundario` | `#9A9AA0` | apoio sobre preto |
| `--cor-sucesso` / `--cor-sucesso-fundo` | `text-sucesso` / `bg-sucesso-fundo` | `#2E9E5B` / `#E6F5EC` | ativo, pago, finalizado |
| `--cor-atencao` / `--cor-atencao-fundo` | `text-atencao` / `bg-atencao-fundo` | `#E0A800` / `#FDF4DC` | pendente, vencendo |
| `--cor-erro` / `--cor-erro-fundo` | `text-erro` / `bg-erro-fundo` | `#D93A3A` / `#FDECEC` | erro, inativo, atrasado |

Contraste verificado: texto `#111113` sobre `#F5C518` = 11,4:1. Texto `#9A9AA0` sobre
`#0B0B0C` = 7,3:1. Nenhum par abaixo de 4,5:1 em texto normal.

---

## Tipografia

Pilha: `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif`.

**Sentence case sempre.** Nunca CAIXA ALTA em rótulo, botão ou badge.

| Token | Classe | Tamanho / altura / peso | Uso |
|---|---|---|---|
| destaque | `text-destaque` | 40 / 44 / 700 | contador e valor grande |
| título | `text-titulo` | 28 / 34 / 700 | "Olá, Tiago!" |
| seção | `text-secao` | 20 / 26 / 600 | título de card e de tela interna |
| corpo | `text-corpo` | 16 / 24 / 400 | texto e **todo input** |
| rótulo | `text-rotulo` | 14 / 20 / 500 | label de campo, rótulo acima do número |
| apoio | `text-apoio` | 13 / 18 / 400 | linha de contexto, texto secundário |
| micro | `text-micro` | 11 / 14 / 600 | rótulo da tab bar |

**16px é o piso de todo `input`, `select` e `textarea`** — abaixo disso o Safari do iPhone
dá zoom sozinho ao focar o campo, e o usuário perde o enquadramento da tela.

O par de destaque é sempre: rótulo pequeno e discreto **acima**, número grande **abaixo**.
Nunca o contrário.

---

## Espaçamento

Escala base 4, em `px`: `2 4 8 12 16 20 24 32 40 48`.

- Padding interno de card: **20 a 24**. Nada apertado.
- Margem lateral da tela: **20**.
- Distância entre cards de uma lista: **12**.
- Distância entre blocos de assunto diferente: **32**.

## Raio

| Token | Classe | Valor | Uso |
|---|---|---|---|
| `--raio-card` | `rounded-card` | 20px | card grande |
| `--raio-controle` | `rounded-controle` | 14px | botão, campo, seleção |
| `--raio-badge` | `rounded-badge` | 10px | badge de status |
| `--raio-folha` | `rounded-folha` | 24px | modal / folha que sobe |
| — | `rounded-full` | 999px | ícone em círculo, avatar |

## Sombra

| Token | Classe | Valor |
|---|---|---|
| `--sombra-card` | `shadow-card` | `0 8px 28px -10px rgba(0,0,0,.55)` |
| `--sombra-flutuante` | `shadow-flutuante` | `0 12px 40px -12px rgba(0,0,0,.65)` |

Sombra é sempre suave e difusa. Card branco sobre fundo preto não leva borda — a sombra
já dá a separação.

## Altura e alvo de toque

| Token | Classe | Valor | Nota |
|---|---|---|---|
| `--altura-toque` | `min-h-toque` | 48px | **mínimo de qualquer alvo tocável** |
| `--altura-botao` | `h-botao` | 56px | botão de ação principal |
| `--altura-campo` | `h-campo` | 52px | input, select |
| `--altura-linha-lista` | `min-h-linha` | 64px | linha de lista em card |
| `--altura-tabbar` | `h-tabbar` | 60px | + `env(safe-area-inset-bottom)` |

48px é regra de acessibilidade e regra de oficina: mão com luva, dedo com graxa, celular
apoiado no banco da moto.

## Movimento

| Token | Valor |
|---|---|
| `--transicao` | `160ms cubic-bezier(.2,.8,.2,1)` |
| `--transicao-folha` | `200ms cubic-bezier(.2,.8,.2,1)` |

Transição só existe como resposta a uma ação do usuário. Nada entra na tela sozinho,
nada pulsa, nada gira de enfeite. Sob `prefers-reduced-motion: reduce` todas as durações
vão a `0.01ms` — regra global em `globais.css`, não repetida por componente.

## Foco

Anel de 2px em `--cor-acento` com offset de 2px, visível em **todo** elemento focável,
inclusive dentro do card branco. Nunca `outline: none` sem substituto.

---

## Composição

**Tela.** Fundo preto. Cabeçalho com saudação pessoal em `titulo` e uma linha de contexto
em `apoio` logo abaixo ("3 motos na oficina hoje"). Conteúdo em cards. Tab bar fixa embaixo,
respeitando a safe area do iPhone.

**Card branco.** Raio 20, padding 20–24, sombra difusa, texto escuro. É onde mora o conteúdo
que importa. Card escuro (`#1A1A1C`) é para conteúdo secundário que não deve competir.

**Linha de lista.** Um registro por linha, altura mínima 64: à esquerda um ícone em círculo
amarelo (40px) ou a placa em destaque, no meio o nome e uma linha de apoio, à direita o
badge de status. A linha inteira é tocável.

**Badge.** Raio 10, padding 4/10, `text-apoio` peso 500, fundo suave e texto na cor forte
do estado. Nunca só cor — sempre com a palavra ("Inativo", "Repor").

**Badge só quando ele tem o que dizer.** Numa lista onde quase tudo está ativo, um badge
"Ativo" em cada linha não informa nada e ainda rouba a largura do nome do produto, que é o
que a pessoa está procurando — na tela estreita isso vira "Pastilha de frei...". Marque a
exceção (inativo, estoque para repor) e deixe o normal em silêncio. A exceção é a tela de
colaboradores, onde quem tem e quem não tem acesso é justamente o assunto.

**Botão principal.** Largura total, altura 56, fundo amarelo, texto `#111113` peso 600,
raio 14. Um por tela. Ação secundária é botão de contorno; ação destrutiva é texto vermelho,
nunca um botão vermelho cheio.

**Nunca corrija a cor de um botão por `className`.** Entre duas classes de cor do
Tailwind — `text-escuro` e `text-claro`, por exemplo — quem vence não é a que aparece
depois no atributo, é a que aparece depois no CSS gerado. O resultado é imprevisível:
já produziu um botão de texto branco dentro de card branco, invisível. Se um botão
precisa de outra cor, ele precisa de outra **variante**. Por isso existem `contorno`
(sobre o fundo preto) e `contorno-no-card` (dentro do card branco), em vez de um
`contorno` remendado nos dois lugares.

**Ícone ilustrativo.** Círculo de fundo `--cor-acento-suave` com o traço em `#111113`
dentro do card branco; círculo `--cor-acento` com traço escuro sobre fundo preto.

**Estado vazio.** Ícone em círculo, uma frase que explica e uma que convida, e o botão de
ação: "Nenhuma moto cadastrada ainda. Cadastre a primeira." Nunca só "Sem resultados".

**Estado de erro.** Diz o que aconteceu e o que fazer: "Não foi possível salvar o cliente.
Verifique a conexão e toque em tentar de novo." Nunca código de erro cru na cara do usuário.

---

## Formato brasileiro

- Data: `dd/MM/yyyy` — `date-fns` com locale `ptBR`, formatação centralizada em `lib/formato.ts`.
- Moeda: `R$ 1.234,56` — `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
- Telefone: `(11) 98765-4321`, com máscara na digitação.
- Placa: sempre em maiúscula, sem hífen, aceitando o padrão antigo (`ABC1234`) e o
  Mercosul (`ABC1D23`). Normalizada no banco por trigger, não só na tela.
