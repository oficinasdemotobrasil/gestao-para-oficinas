#!/bin/bash
#
# Copia uma migração para a área de transferência — e confere que chegou
# inteira.
#
# Por que isto existe: `pbcopy` sem LC_CTYPE lê os bytes UTF-8 como MacRoman.
# "devolução" vira "devolu√ß√£o" na área de transferência, e é esse lixo que o
# editor do Supabase recebe. Como `pbpaste` erra de volta na mesma direção, um
# `pbcopy arquivo && pbpaste` mostra tudo certo no terminal — o defeito é
# invisível justamente para quem tentaria conferir.
#
# Quem enxerga a área de transferência como o sistema é o osascript. Por isso a
# conferência abaixo passa por ele, e não por pbpaste.
#
#   ./scripts/copiar-sql.sh supabase/migrations/0057_alguma_coisa.sql

set -euo pipefail

arquivo="${1:?Informe o arquivo .sql}"
[ -f "$arquivo" ] || { echo "Não achei $arquivo"; exit 1; }

temporario=$(mktemp)
trap 'rm -f "$temporario"' EXIT

LC_CTYPE=UTF-8 pbcopy < "$arquivo"

# O texto como qualquer outro aplicativo do Mac vai recebê-lo.
#
# O AppleScript devolve as linhas separadas por CR, não por LF — comparar sem
# normalizar acusa diferença em todo arquivo com mais de uma linha. O `tr` abaixo
# existe só para isso; ele não toca em acento nenhum.
osascript -e 'the clipboard as text' | tr '\r' '\n' > "$temporario"

# O osascript acrescenta uma quebra no fim. Comparar ignorando linhas vazias
# finais é o suficiente: quebra sobrando não muda SQL nenhum, acento sim.
sem_fim() { sed -e :a -e '/^[[:space:]]*$/{$d;N;ba' -e '}' "$1"; }

if ! diff -q <(sem_fim "$arquivo") <(sem_fim "$temporario") > /dev/null; then
  echo "A área de transferência NÃO bate com o arquivo. Não cole." >&2
  diff "$arquivo" "$temporario" | head -6 >&2
  exit 1
fi
copiado=$(cat "$temporario")

# A assinatura do defeito: bytes UTF-8 lidos como MacRoman.
if printf '%s' "$copiado" | LC_ALL=C grep -q $'\xe2\x88\x9a\|\xe2\x80\x9a\xc3\x84'; then
  echo "Achei acento corrompido na área de transferência. Não cole." >&2
  exit 1
fi

linhas=$(wc -l < "$arquivo" | tr -d ' ')
acentos=$(LC_ALL=C grep -c $'[\xc3\xa0-\xc3\xbf\xe2\x80\x94]' "$arquivo" || true)
echo "Copiado: $linhas linhas, $acentos com acento — conferido pelo sistema, não pelo pbpaste."
