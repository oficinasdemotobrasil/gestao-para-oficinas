
## Passar SQL para o SQL Editor

Use `./scripts/copiar-sql.sh <arquivo>`, nunca `pbcopy` direto.

`pbcopy` sem `LC_CTYPE` lê os bytes UTF-8 como MacRoman: "devolução" chega no
editor do Supabase como "devolu√ß√£o". E como `pbpaste` erra de volta na mesma
direção, conferir com `pbcopy arquivo && pbpaste` mostra tudo certo — o defeito
é invisível exatamente para quem tentaria enxergá-lo.

Quem vê a área de transferência como os outros aplicativos é o `osascript`. O
script copia com o locale certo e confere por ele; se não bater, ele recusa e
mostra a diferença em vez de deixar você colar lixo em produção.

## Antes de dar como "publicado"

`tsc --noEmit -p .` e `npm run build` **não são a mesma checagem**. O build
de verdade usa `tsc -b` (modo de projeto), mais rígido, e é o comando que a
Vercel roda. Um arquivo pode passar limpo no primeiro e quebrar o segundo —
foi o que aconteceu em setembro/2026: 7 erros em `scripts/validar-banco.ts`
ficaram invisíveis por dias, cada deploy falhava em silêncio na Vercel, e o
site continuava servindo a versão antiga sem ninguém perceber.

Por isso: **antes de dizer "está no ar", rode `npm run build` de verdade** —
não só `tsc --noEmit`. E depois de publicar, confira o bundle no próprio
site (o hash do arquivo em `assets/index-*.js` muda a cada deploy).

Há também um gancho de pré-push (`.githooks/pre-push`) que roda o build
automaticamente e trava o `git push` se ele falhar. Ele já está ativo neste
clone (`git config core.hooksPath .githooks`). Numa clonagem nova, rode esse
comando uma vez para ligar a trava — sem isso o gancho existe no repositório
mas não é chamado.
