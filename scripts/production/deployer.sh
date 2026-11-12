#!/usr/bin/env bash
# Livre une version étiquetée de main sur le serveur (design/PLAN-PRODUCTION.md, section 7).
#
#   sudo bash /srv/reunea/current/scripts/production/deployer.sh v2026.11.12-1
#   (premier déploiement : sudo bash /srv/reunea/repo/scripts/production/deployer.sh <étiquette>)
#
# 1. récupère l'étiquette (dépôt public, clone HTTPS en lecture) ; refusée si
#    elle n'est pas sur main ;
# 2. extrait la version dans releases/<sha>, lie .env, `npm ci` et build
#    (l'ancienne version sert toujours ; un échec ici ne touche à rien) ;
# 3. sauvegarde la base, puis `prisma migrate deploy` ;
# 4. bascule `current`, redémarre le service, contrôle de fumée ;
#    en cas d'échec, retour automatique à la version précédente.
#
# Étiquettes : v<année>.<mois>.<jour>-<n> (décision D15), posées sur main après fusion.
set -euo pipefail
DOSSIER_SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
source "$DOSSIER_SCRIPTS/commun.sh"

etiquette="${1:-}"
[[ "$etiquette" =~ ^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}-[0-9]+$ ]] \
  || echouer "usage : deployer.sh v<AAAA>.<MM>.<JJ>-<n> (étiquette reçue : '${etiquette}')"

DEPOT="$REUNEA_RACINE/repo"
[ -d "$DEPOT/.git" ] || echouer "dépôt absent : $DEPOT (voir deploiement/LISEZMOI.md, section 3)"
[ -f "$REUNEA_ENV" ] || echouer "secrets absents : $REUNEA_ENV (modèle : deploiement/reunea.env.example)"
FUMEE="${REUNEA_FUMEE:-$DOSSIER_SCRIPTS/fumee.sh}"
SAUVEGARDER="${REUNEA_SAUVEGARDER:-$DOSSIER_SCRIPTS/sauvegarder-base.sh}"

etape "Récupération de $etiquette"
en_service git -C "$DEPOT" fetch --quiet --tags --force origin main
# git sous l'utilisateur du service, propriétaire du dépôt : en root, git
# refuserait un dépôt qui ne lui appartient pas (« dubious ownership »).
sha="$(en_service git -C "$DEPOT" rev-parse --verify --quiet "refs/tags/$etiquette^{commit}")" \
  || echouer "étiquette inconnue : $etiquette"
en_service git -C "$DEPOT" merge-base --is-ancestor "$sha" origin/main \
  || echouer "$etiquette ($sha) n'est pas sur main : on ne livre que ce qui a été fusionné"

destination="$RELEASES/$sha"
precedente="$(version_courante)"
[ "$precedente" != "$destination" ] || echouer "$etiquette ($sha) est déjà en service"

etape "Extraction dans $destination"
en_service mkdir -p "$RELEASES"
en_service rm -rf "$destination"
en_service mkdir "$destination"
en_service git -C "$DEPOT" archive "$sha" | en_service tar -x -C "$destination"
en_service ln -s "$REUNEA_ENV" "$destination/.env"

etape "Installation et build (l'ancienne version sert toujours)"
(cd "$destination" && en_service npm ci --no-audit --no-fund)
# Identifiant de déploiement : un onglet ouvert sur l'ancienne version se
# recharge au lieu d'appeler des Server Actions disparues
# (docs 05-config/01-next-config-js/deploymentId.md).
(cd "$destination" && en_service env NEXT_DEPLOYMENT_ID="$sha" npm run build)

if [ -f "$REUNEA_BASE" ]; then
  etape "Sauvegarde de la base avant migration"
  en_service bash "$SAUVEGARDER" "avant-$etiquette"
fi

etape "Migrations (prisma migrate deploy)"
(cd "$destination" && en_service npx prisma migrate deploy) \
  || echouer "migration en échec : la version en service n'a pas changé ; si la base est abîmée, restaurer la sauvegarde avant-$etiquette (restaurer-base.sh)"

etape "Mise en service"
basculer_vers "$destination"
en_service touch "$destination"
service restart

if bash "$FUMEE"; then
  noter_livraison "livraison $etiquette $sha"
  etape "$etiquette est en service."
else
  if [ -n "$precedente" ]; then
    etape "Contrôle de fumée en échec : retour à $(basename "$precedente")"
    basculer_vers "$precedente"
    en_service touch "$destination/.retiree"
    service restart
    noter_livraison "echec $etiquette $sha, retour $(basename "$precedente")"
    bash "$FUMEE" || true
  else
    noter_livraison "echec $etiquette $sha (premier déploiement, rien vers quoi revenir)"
  fi
  echouer "livraison de $etiquette annulée (voir journalctl -u $REUNEA_SERVICE)"
fi

# Ménage : garde les versions les plus récentes, jamais la courante ni la précédente.
versions="$(ls -1dt "$RELEASES"/*/ 2>/dev/null || true)"
printf '%s\n' "$versions" | sed 's:/$::' | tail -n "+$((REUNEA_VERSIONS_GARDEES + 1))" \
  | while read -r ancienne; do
      if [ -n "$ancienne" ] && [ "$ancienne" != "$destination" ] && [ "$ancienne" != "$precedente" ]; then
        en_service rm -rf "$ancienne"
      fi
    done
