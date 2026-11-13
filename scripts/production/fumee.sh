#!/usr/bin/env bash
# Contrôle de fumée après une livraison (design/PLAN-PRODUCTION.md, section 7.3).
#
#   bash scripts/production/fumee.sh                          # Next en local, http://localhost:3000
#   bash scripts/production/fumee.sh https://reservations.exemple.fr   # à travers Caddy
#
# LECTURE SEULE : aucune écriture, aucun compte, aucun e-mail. Attend d'abord
# que le serveur réponde (démarrage après un redémarrage), 60 s au plus.
set -euo pipefail
source "$(dirname "$0")/commun.sh"

adresse="${1:-$REUNEA_URL_LOCALE}"
adresse="${adresse%/}"
attente="${REUNEA_ATTENTE_SECONDES:-60}"
echecs=0

code_http() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$adresse$1" || true
}

verifier() {
  local libelle="$1" obtenu="$2" attendu="$3"
  if [ "$obtenu" = "$attendu" ]; then
    echo "  ok      $libelle"
  else
    echo "  ÉCHEC   $libelle (obtenu : ${obtenu:-rien}, attendu : $attendu)"
    echecs=$((echecs + 1))
  fi
}

etape "Contrôle de fumée sur $adresse"
for ((i = 0; i < attente; i++)); do
  [ "$(code_http /api/sante)" = "200" ] && break
  sleep 1
done

verifier "santé : /api/sante répond 200" "$(code_http /api/sante)" "200"
verifier "santé : la base répond" \
  "$(curl -s --max-time 10 "$adresse/api/sante" | tr -d ' \n' || true)" '{"ok":true}'
verifier "accueil : / répond 200" "$(code_http /)" "200"
verifier "salles : /salles répond 200" "$(code_http /salles)" "200"
page_salles="$(curl -s --max-time 10 "$adresse/salles" || true)"
verifier "salles : la liste contient Horizon" \
  "$([[ "$page_salles" == *Horizon* ]] && echo oui || echo non)" "oui"
verifier "démonstration : /demonstration répond 200" "$(code_http /demonstration)" "200"
verifier "404 : salle inconnue" "$(code_http /salles/salle-inconnue)" "404"
verifier "accès : /compte sans session renvoie vers la connexion" "$(code_http /compte)" "307"
verifier "accès : /admin sans session renvoie vers la connexion" "$(code_http /admin)" "307"
# En-têtes de la page d'accueil (next.config.ts : poweredByHeader: false).
entetes="$(curl -s -D - -o /dev/null --max-time 10 "$adresse/" || true)"
if ! printf '%s\n' "$entetes" | grep -q '^HTTP/'; then
  powered="pas de réponse"   # sans réponse, l'absence de l'en-tête ne prouve rien
elif printf '%s\n' "$entetes" | grep -qi '^x-powered-by:'; then
  powered="présent"
else
  powered="absent"
fi
verifier "en-têtes : pas de X-Powered-By" "$powered" "absent"

if [ "$echecs" -gt 0 ]; then
  echo "Contrôle de fumée : $echecs échec(s)." >&2
  exit 1
fi
echo "Contrôle de fumée : tout est bon."
