
## Passar SQL para o SQL Editor

Use `./scripts/copiar-sql.sh <arquivo>`, nunca `pbcopy` direto.

`pbcopy` sem `LC_CTYPE` lê os bytes UTF-8 como MacRoman: "devolução" chega no
editor do Supabase como "devolu√ß√£o". E como `pbpaste` erra de volta na mesma
direção, conferir com `pbcopy arquivo && pbpaste` mostra tudo certo — o defeito
é invisível exatamente para quem tentaria enxergá-lo.

Quem vê a área de transferência como os outros aplicativos é o `osascript`. O
script copia com o locale certo e confere por ele; se não bater, ele recusa e
mostra a diferença em vez de deixar você colar lixo em produção.
