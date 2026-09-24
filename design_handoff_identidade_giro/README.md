# Handoff: Identidade visual GIRO

## Overview
Marca e sistema visual do GIRO (app de gestão para oficinas de moto). Inclui logotipo (anel com seta no lugar do O), cores, tipografia e regras de uso de amarelo e verde.

## About the Design Files
Os arquivos `.dc.html` são **referências de design em HTML**, não código de produção. A tarefa é **recriar** estes padrões no ambiente existente do projeto (componentes, tema, CSS) usando os padrões já estabelecidos. Os arquivos de `assets/` (SVG) e `tokens.css` podem ser usados diretamente.

## Fidelity
**High-fidelity.** Cores, tipografia e geometria da marca são finais.

## Logotipo (principal)
Arquivo: `GIRO - Logotipo.dc.html`
- Palavra "GIR" em **Archivo 900**, letter-spacing **-0.035em**, line-height 1.
- O "O" é substituído pelo símbolo (anel + seta) — `assets/giro-simbolo-amarelo.svg`.
- Tamanho do símbolo = **0.833 × font-size** do texto (ex.: texto 180px → símbolo 150px; texto 28px → 24px).
- Encaixe: `display:flex; align-items:center`; símbolo com margin-left ≈ **-0.033em** (kerning negativo) e margin-bottom ≈ -0.033em.
- Versões (só estas três):
  - Fundo preto: letras #FFFFFF, símbolo #F5C518.
  - Fundo amarelo: tudo #0B0B0C.
  - Fundo branco: tudo #0B0B0C.
- Tamanho mínimo do logotipo: texto 22px. Abaixo disso usar só o ícone.
- Espaço livre: 1 diâmetro do anel em volta.

### Geometria do símbolo (viewBox 0 0 100 100)
```svg
<path d="M31.2 25.4 A32 32 0 1 0 72 23.6" fill="none" stroke="currentColor" stroke-width="15"/>
<path d="M66 4 L92 20 L64 36 Z" fill="currentColor"/>
```
Use `currentColor` para tematizar.

## Ícone do app / favicon
`assets/giro-icone-app.svg`: quadrado #F5C518, símbolo #0B0B0C a ~62% do lado. Raio ≈ 21% do lado (96px → 20px; 32px → 6px).

## Cores
Ver `tokens.css`.
- **Amarelo #F5C518 nunca é cor de texto sobre fundo claro** (chega a 1,63:1). Usar `--giro-amarelo-ferro` #7A5C00. Sobre preto, amarelo puro como texto é OK.
- **Verde é exclusivo de dinheiro**: botão pagar/receber, selo "PAGO", valor recebido. Nada mais (menus, gráficos, decoração = proibido).
  - Botão/selo com texto branco: fundo **#0B6B35**.
  - Selo vazado no escuro: borda 2px #12A150, texto #3DDB85.
- Sem gradientes. Cores chapadas.

## Tipografia
Google Fonts: Archivo (600–900), IBM Plex Sans (400–700), IBM Plex Mono (500–600).
- Títulos/marca: Archivo 800–900, caixa alta só em títulos curtos.
- UI: IBM Plex Sans; corpo 16px; mínimo 13px para rótulos.
- Valores monetários: sempre o maior número da tela; `font-variant-numeric: tabular-nums`.

## Componentes de referência
- Botão primário: fundo #F5C518, texto #0B0B0C, Archivo 800 16–17px, altura ≥56px, raio 2px.
- Input escuro: fundo #17171A, borda 1px #34343A, texto 15–16px, placeholder #6D6D75.
- Selo PAGO: fundo #0B6B35, texto #FFF, IBM Plex Mono 700 11–12px, letter-spacing 0.1em, padding 8–9px 12–14px, inline-flex, nowrap.
- PDF de orçamento: faixa de topo #0B0B0C com logotipo (versão preta) + linha de 5–6px #F5C518; corpo branco; total em Archivo 900 32–38px.

## Não fazer
Gradiente · emoji · diminutivos/voz fofa · tudo centralizado · amarelo como texto em fundo claro · verde decorativo · cantos com raio > 2px.

## Files
- `GIRO - Logotipo.dc.html` — logotipo, encaixe, redução, aplicações (referência principal)
- `GIRO - Identidade Visual.dc.html` — sistema completo (cor, tipo, regras, PDF)
- `tokens.css` — tokens prontos
- `assets/` — SVGs do símbolo e do ícone
