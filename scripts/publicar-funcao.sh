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
# A colagem às vezes traz coisa junto: espaço, quebra de linha, os códigos
# invisíveis que o terminal põe em volta do que se cola, ou o token duas vezes.
# Em vez de exigir o texto limpo, procura o token dentro do que veio. O formato
# é o que a linha de comando aceita: sbp_ e mais 40 letras/números.
colado="$SUPABASE_ACCESS_TOKEN"
SUPABASE_ACCESS_TOKEN="$(printf '%s' "$colado" | { grep -oE 'sbp_(oauth_)?[a-f0-9]{40}' || true; } | head -1)"
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  vezes=$(printf '%s' "$colado" | { grep -o 'sbp_' || true; } | wc -l | tr -d ' ')
  echo "Não achei um token no que foi colado (o texto não é mostrado aqui)."
  echo "  Tamanho do que chegou: ${#colado} caracteres (um token tem 44)."
  if [ "$vezes" -eq 0 ]; then
    echo "  Não tem \"sbp_\": parece que a área de transferência não estava com o token."
    echo "  Copie o token de novo no site do Supabase e rode outra vez."
  else
    echo "  Tem \"sbp_\", mas o resto não bate: o token pode ter sido copiado pela metade."
    echo "  Gere um token novo, use o botão de copiar ao lado dele e rode outra vez."
  fi
  exit 1
fi
export SUPABASE_ACCESS_TOKEN

cd "$raiz"
# shellcheck disable=SC2086
npx --yes supabase functions deploy "$FUNCAO" --project-ref "$PROJETO" $extra

echo
echo "Pronto: \"$FUNCAO\" publicada no GIRO."
