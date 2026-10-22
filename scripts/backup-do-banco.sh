#!/usr/bin/env bash
# Cópia de segurança do banco do GIRO, guardada FORA do Supabase.
#
# Por que existe (auditoria de 21/10/2026): no plano gratuito o Supabase não
# guarda backup que dê para restaurar. Se um dado for apagado por engano, ou o
# projeto se perder, sem esta cópia não há volta. Rode uma vez por semana.
#
# O que leva:
#   - giro-<data>-dados.dump  → todas as tabelas do app (oficinas, OS, financeiro…)
#   - giro-<data>-contas.dump → as contas de acesso (quem entra com qual e-mail)
# O que NÃO leva: os arquivos (fotos das OS, logos) — ficam no Storage.
#
# Precisa do pg_dump: instale o Postgres.app (https://postgresapp.com), que é
# gratuito, e rode de novo. O endereço de conexão é colado na hora, sem
# aparecer na tela e sem ficar salvo em lugar nenhum.
#
# Os arquivos têm dados de clientes das oficinas (nomes, telefones, valores):
# a pasta fica só com o seu usuário do Mac podendo abrir.
#
# Uso:  ./scripts/backup-do-banco.sh

set -euo pipefail

PASTA="${PASTA_DOS_BACKUPS:-$HOME/Documents/Backups do GIRO}"
MANTER=8   # semanas guardadas; as mais antigas saem sozinhas

PG_DUMP=""
for c in \
  "$(command -v pg_dump 2>/dev/null || true)" \
  /Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump \
  /opt/homebrew/opt/libpq/bin/pg_dump \
  /usr/local/opt/libpq/bin/pg_dump; do
  if [ -n "$c" ] && [ -x "$c" ]; then PG_DUMP="$c"; break; fi
done
if [ -z "$PG_DUMP" ]; then
  echo "Não achei o pg_dump. Instale o Postgres.app (https://postgresapp.com) e rode de novo."
  exit 1
fi
PG_RESTORE="$(dirname "$PG_DUMP")/pg_restore"

echo "Cole o endereço de conexão do Supabase (botão Connect > Session pooler),"
echo "já com a senha do banco no lugar de [YOUR-PASSWORD], e aperte Enter."
echo "Ele não aparece na tela e não fica guardado:"
read -rs ENDERECO
echo
case "$ENDERECO" in
  postgresql://*|postgres://*) ;;
  *) echo "Isso não parece um endereço de conexão (começa com postgresql://)."; exit 1 ;;
esac
case "$ENDERECO" in
  *YOUR-PASSWORD*) echo "Falta trocar [YOUR-PASSWORD] pela senha do banco."; exit 1 ;;
esac
# Este script é do GIRO Motos: endereço de outro projeto é recusado, para a
# cópia de um banco nunca ser guardada com o nome de outro.
case "$ENDERECO" in
  *ilkwxilkwjinuktgzlaq*) ;;
  *) echo "PAROU: esse endereço NÃO é do banco do GIRO Motos (ilkwxilkwjinuktgzlaq)."; exit 1 ;;
esac

mkdir -p "$PASTA"
chmod 700 "$PASTA"
QUANDO="$(date +%Y-%m-%d_%H%M)"
DADOS="$PASTA/giro-$QUANDO-dados.dump"
CONTAS="$PASTA/giro-$QUANDO-contas.dump"

echo "1/2 Copiando as tabelas do app…"
"$PG_DUMP" "$ENDERECO" --format=custom --no-owner --no-privileges \
  --schema=public --file="$DADOS"
chmod 600 "$DADOS"

echo "2/2 Copiando as contas de acesso…"
if "$PG_DUMP" "$ENDERECO" --format=custom --no-owner --no-privileges --data-only \
     --table=auth.users --table=auth.identities --file="$CONTAS"; then
  chmod 600 "$CONTAS"
else
  rm -f "$CONTAS"
  echo "AVISO: as contas de acesso não foram copiadas (as tabelas do app foram)."
fi

tabelas=$("$PG_RESTORE" --list "$DADOS" | grep -c "TABLE DATA" || true)
echo
echo "Pronto. $tabelas tabelas copiadas."
ls -lh "$PASTA"/giro-"$QUANDO"-*.dump | awk '{print "  " $5 "  " $NF}'

# Guarda só as últimas $MANTER cópias de cada tipo.
for tipo in dados contas; do
  ls -1t "$PASTA"/giro-*-"$tipo".dump 2>/dev/null | tail -n +$((MANTER + 1)) |
    while IFS= read -r velho; do rm -f -- "$velho"; done
done
