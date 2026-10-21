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
case "$SUPABASE_ACCESS_TOKEN" in
  sbp_*) ;;
  *) echo "Isso não parece um token de acesso do Supabase (começa com sbp_)."; exit 1 ;;
esac
export SUPABASE_ACCESS_TOKEN

cd "$raiz"
# shellcheck disable=SC2086
npx --yes supabase functions deploy "$FUNCAO" --project-ref "$PROJETO" $extra

echo
echo "Pronto: \"$FUNCAO\" publicada no GIRO."
