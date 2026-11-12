#!/usr/bin/env bash
# Retour arrière du CODE seul (design/PLAN-PRODUCTION.md, section 8.1) : moins d'une minute.
#
#   sudo bash /srv/reunea/current/scripts/production/revenir.sh          # version précédente
#   sudo bash /srv/reunea/current/scripts/production/revenir.sh <sha>    # une version gardée précise
#
# La base n'est PAS touchée : possible parce que les migrations ne font
# qu'ajouter (section 7.2), l'ancienne version tourne sur le schéma récent.
# La version quittée est marquée « .retiree » : un nouveau retour ne la
# reprend pas par défaut.
set -euo pipefail
DOSSIER_SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
source "$DOSSIER_SCRIPTS/commun.sh"
FUMEE="${REUNEA_FUMEE:-$DOSSIER_SCRIPTS/fumee.sh}"

courante="$(version_courante)"
[ -n "$courante" ] || echouer "aucune version en service ($COURANTE)"

if [ -n "${1:-}" ]; then
  [[ "$1" =~ ^[0-9a-f]{7,40}$ ]] || echouer "identifiant de version invalide : $1"
  cible="$(ls -1d "$RELEASES/$1"* 2>/dev/null | head -n 1 || true)"
  [ -n "$cible" ] || echouer "version absente de $RELEASES : $1"
else
  cible=""
  while read -r version; do
    version="${version%/}"
    if [ "$version" != "$courante" ] && [ ! -e "$version/.retiree" ]; then
      cible="$version"
      break
    fi
  done < <(ls -1dt "$RELEASES"/*/ 2>/dev/null)
  [ -n "$cible" ] || echouer "aucune version précédente disponible dans $RELEASES"
fi
[ "$cible" != "$courante" ] || echouer "$(basename "$cible") est déjà en service"

etape "Retour de $(basename "$courante") vers $(basename "$cible")"
basculer_vers "$cible"
en_service touch "$courante/.retiree"
en_service touch "$cible"
rm -f "$cible/.retiree"
service restart
noter_livraison "retour $(basename "$courante") vers $(basename "$cible")"
bash "$FUMEE"
