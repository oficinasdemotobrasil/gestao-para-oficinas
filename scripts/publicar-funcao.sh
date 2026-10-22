#!/usr/bin/env bash
# Publica uma função do servidor (Edge Function) no projeto do GIRO.
#
# Por que este script existe: a linha de comando do Supabase neste Mac fica
# logada em outra conta (a dos outros projetos), que não enxerga o GIRO. Em vez
# de trocar o login dela — e atrapalhar os outros projetos —, aqui se usa um
# token de acesso da conta do GIRO só nesta publicação.
#
# O token é colado na hora: não aparece na tela, não vai para o histórico do
# terminal e não fica salvo em arquivo nenhum. Gere em
# https://supabase.com/dashboard/account/tokens (logado na conta do GIRO) e
# apague lá depois, se quiser.
#
# Uso:  ./scripts/publicar-funcao.sh cadastro

set -euo pipefail

FUNCAO="${1:-}"
PROJETO="ilkwxilkwjinuktgzlaq"

# As que o mundo de fora chama sem login (o Asaas, o Cron, quem ainda não tem
# conta) vão sem a verificação de JWT — é o que está no comentário de cada uma.
SEM_LOGIN=" asaas-webhook avisos-diarios cadastro "

raiz="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "$FUNCAO" ] || [ ! -f "$raiz/supabase/functions/$FUNCAO/index.ts" ]; then
  echo "Diga qual função publicar. As que existem:"
  ls "$raiz/supabase/functions"
  exit 1
fi

extra=""
case "$SEM_LOGIN" in *" $FUNCAO "*) extra="--no-verify-jwt" ;; esac

echo "Vai publicar a função \"$FUNCAO\" no projeto do GIRO ($PROJETO) $extra"
echo "Cole o token de acesso do Supabase e aperte Enter (ele não aparece):"
read -rs SUPABASE_ACCESS_TOKEN
echo
# Colagem às vezes traz espaço, quebra de linha ou caractere invisível junto.
SUPABASE_ACCESS_TOKEN="$(printf '%s' "$SUPABASE_ACCESS_TOKEN" | tr -cd 'A-Za-z0-9_')"
# O formato que a linha de comando aceita: sbp_ e mais 40 letras/números.
if ! printf '%s' "$SUPABASE_ACCESS_TOKEN" | grep -Eq '^sbp_(oauth_)?[a-f0-9]{40}$'; then
  vezes=$(printf '%s' "$SUPABASE_ACCESS_TOKEN" | { grep -o 'sbp_' || true; } | wc -l | tr -d ' ')
  echo "O que foi colado não tem o formato de um token (o token não é mostrado aqui)."
  echo "  Tamanho: ${#SUPABASE_ACCESS_TOKEN} caracteres (um token tem 44)."
  echo "  \"sbp_\" aparece $vezes vez(es) (deveria aparecer 1)."
  [ "$vezes" -gt 1 ] && echo "  Parece que foi colado mais de uma vez. Cole UMA vez só e aperte Enter."
  [ "$vezes" -eq 0 ] && echo "  Não parece um token. Copie de novo o token gerado (começa com sbp_)."
  exit 1
fi
export SUPABASE_ACCESS_TOKEN

cd "$raiz"
# shellcheck disable=SC2086
npx --yes supabase functions deploy "$FUNCAO" --project-ref "$PROJETO" $extra

echo
echo "Pronto: \"$FUNCAO\" publicada no GIRO."
