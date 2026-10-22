#!/usr/bin/env bash
# Aplica no banco do GIRO uma migração já testada — direto do terminal, sem
# navegador e sem copiar e colar no SQL Editor.
#
# Antes de rodar isto, a migração passou no `npm run validar:banco`.
#
# As travas:
#   - O endereço de conexão (com a senha) é colado na hora: não aparece na tela,
#     não vai para o histórico e não fica salvo. Ele mora no seu cofre.
#   - Só aceita o banco do GIRO Motos. Endereço de outro projeto é recusado.
#   - Mostra o que vai aplicar e só segue se você digitar SIM.
#   - Roda tudo numa transação: se der qualquer erro, nada é aplicado.
#   - A conferência (segundo arquivo, opcional) roda em modo SÓ LEITURA.
#
# Uso:
#   ./scripts/aplicar-migracao.sh supabase/migrations/0087_algo.sql
#   ./scripts/aplicar-migracao.sh supabase/migrations/0087_algo.sql conferencia.sql
#   ./scripts/aplicar-migracao.sh --so-conferir conferencia.sql   (só lê; não muda nada)

set -euo pipefail

PROJETO="ilkwxilkwjinuktgzlaq"   # GIRO Motos — o único banco que este script aceita
SO_CONFERIR=""
if [ "${1:-}" = "--so-conferir" ]; then
  SO_CONFERIR="sim"
  MIGRACAO=""
  CONFERENCIA="${2:-}"
  if [ -z "$CONFERENCIA" ]; then
    echo "Diga qual consulta rodar: ./scripts/aplicar-migracao.sh --so-conferir consulta.sql"
    exit 1
  fi
else
  MIGRACAO="${1:-}"
  CONFERENCIA="${2:-}"
fi

if [ -z "$SO_CONFERIR" ] && { [ -z "$MIGRACAO" ] || [ ! -f "$MIGRACAO" ]; }; then
  echo "Diga qual migração aplicar, por exemplo:"
  echo "  ./scripts/aplicar-migracao.sh supabase/migrations/0087_algo.sql"
  exit 1
fi
if [ -n "$CONFERENCIA" ] && [ ! -f "$CONFERENCIA" ]; then
  echo "Não achei o arquivo de conferência: $CONFERENCIA"
  exit 1
fi
# A transação é do script. Um begin/commit dentro do arquivo a quebraria ao meio.
if [ -z "$SO_CONFERIR" ] && grep -Eiq '^[[:space:]]*(begin|commit|rollback)[[:space:]]*;' "$MIGRACAO"; then
  echo "A migração tem begin/commit próprios. Tire essas linhas: o script já roda tudo numa transação."
  exit 1
fi

PSQL=""
for c in \
  "$(command -v psql 2>/dev/null || true)" \
  /Applications/Postgres.app/Contents/Versions/latest/bin/psql \
  /opt/homebrew/opt/libpq/bin/psql \
  /usr/local/opt/libpq/bin/psql; do
  if [ -n "$c" ] && [ -x "$c" ]; then PSQL="$c"; break; fi
done
if [ -z "$PSQL" ]; then
  echo "Não achei o psql. Ele vem com o Postgres.app (https://postgresapp.com)."
  exit 1
fi

echo "Banco:     GIRO Motos ($PROJETO)"
if [ -z "$SO_CONFERIR" ]; then
  titulo="$(grep -m1 '^-- ' "$MIGRACAO" | sed 's/^-- //')"
  echo "Migração:  $(basename "$MIGRACAO")  —  ${titulo:-sem título}"
  echo "Tamanho:   $(wc -l < "$MIGRACAO" | tr -d ' ') linhas"
fi
[ -n "$CONFERENCIA" ] && echo "Conferência: $(basename "$CONFERENCIA") (só leitura)"
echo
echo "Cole o endereço de conexão do cofre (Session pooler, com a senha) e aperte Enter."
echo "Ele não aparece na tela:"
read -rs ENDERECO
echo
# O terminal do app embrulha o que se cola em códigos invisíveis (ESC[200~ …
# ESC[201~), e às vezes vem espaço ou o endereço duas vezes. Em vez de exigir o
# texto limpo, tira os códigos e acha o endereço dentro do que veio.
colado="$ENDERECO"
ENDERECO="$(printf '%s' "$colado" | tr -d '\000-\037\177' | sed -e 's/\[200~//g' -e 's/\[201~//g' -e 's#postgresql://#\
postgresql://#g' |
  { grep -oE 'postgres(ql)?://[^[:space:]]+' || true; } | head -1)"
if [ -z "$ENDERECO" ]; then
  echo "Não achei um endereço de conexão no que foi colado (o texto não é mostrado aqui)."
  echo "  Tamanho do que chegou: ${#colado} caracteres."
  case "$colado" in
    *pooler.supabase.com*|*supabase.co*) echo "  Tem o nome do servidor, mas falta o começo \"postgresql://\": copie o endereço inteiro." ;;
    *) echo "  Não parece o endereço do banco. Copie do cofre o endereço que começa com postgresql://" ;;
  esac
  exit 1
fi
case "$ENDERECO" in
  *YOUR-PASSWORD*) echo "Falta trocar [YOUR-PASSWORD] pela senha do banco."; exit 1 ;;
esac
case "$ENDERECO" in
  *"$PROJETO"*) ;;
  *) echo "PAROU: esse endereço NÃO é do banco do GIRO Motos ($PROJETO). Nada foi aplicado."; exit 1 ;;
esac

export PGCLIENTENCODING=UTF8

if [ -z "$SO_CONFERIR" ]; then
  printf 'Digite SIM para aplicar no banco de produção: '
  read -r resposta
  if [ "$resposta" != "SIM" ]; then
    echo "Cancelado. Nada foi aplicado."
    exit 1
  fi
  echo
  echo "Aplicando…"
  if ! "$PSQL" "$ENDERECO" -X -q -v ON_ERROR_STOP=1 --single-transaction -f "$MIGRACAO"; then
    echo
    echo "DEU ERRO — nada foi aplicado (a transação voltou atrás). Copie a mensagem acima e mande."
    exit 1
  fi
  echo "Aplicada."
fi

if [ -n "$CONFERENCIA" ]; then
  echo
  echo "Conferência (só leitura):"
  "$PSQL" "$ENDERECO" -X -v ON_ERROR_STOP=1 --single-transaction \
    -c 'set transaction read only' -f "$CONFERENCIA"
fi
