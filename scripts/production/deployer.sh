#!/usr/bin/env bash
# Livre une version étiquetée sur le serveur (design/PLAN-PRODUCTION.md, section 7).
#
#   sudo bash /srv/reunea/current/scripts/production/deployer.sh v2026.11.12-1 module-12B
#   (premier déploiement : sudo bash /srv/reunea/repo/scripts/production/deployer.sh <étiquette> <branche>)
#
# Dépôt de formation : main reste le point de départ vierge des apprenants et
# ne reçoit jamais de fusion. On livre donc depuis la branche du module
# (module-12B...), ou depuis main ; la branche est toujours dite explicitement.
#
# 1. vérifie sur GitHub (dépôt public, clone HTTPS en lecture) que
#    l'étiquette existe, qu'elle est ANNOTÉE (git tag -a : auteur, date,
#    message), et que son commit est sur la branche telle qu'elle est sur
#    GitHub (une branche jamais poussée ne compte pas) ;
# 2. extrait la version dans releases/<sha>, lie .env, `npm ci` et build
#    (l'ancienne version sert toujours ; un échec ici ne touche à rien) ;
# 3. sauvegarde la base, puis `prisma migrate deploy` ;
# 4. bascule `current`, redémarre le service, contrôle de fumée (celui de la
#    version livrée, fumee_de dans commun.sh) ;
#    en cas d'échec, retour automatique à la version précédente.
#
# Étiquettes : v<année>.<mois>.<jour>-<n> (décision D15).
set -euo pipefail
DOSSIER_SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
source "$DOSSIER_SCRIPTS/commun.sh"

USAGE="usage : deployer.sh v<AAAA>.<MM>.<JJ>-<n> <branche>   (branche : main ou module-<n>, ex. module-12B)"
etiquette="${1:-}"
branche="${2:-}"
[[ "$etiquette" =~ ^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}-[0-9]+$ ]] \
  || echouer "$USAGE (étiquette reçue : '${etiquette}')"
[[ "$branche" =~ ^(main|module-[0-9]+[A-Za-z]*)$ ]] \
  || echouer "$USAGE (branche reçue : '${branche}')"

DEPOT="$REUNEA_RACINE/repo"
[ -d "$DEPOT/.git" ] || echouer "dépôt absent : $DEPOT (voir deploiement/LISEZMOI.md, section 3)"
[ -f "$REUNEA_ENV" ] || echouer "secrets absents : $REUNEA_ENV (modèle : deploiement/reunea.env.example)"
SAUVEGARDER="${REUNEA_SAUVEGARDER:-$DOSSIER_SCRIPTS/sauvegarder-base.sh}"

# git sous l'utilisateur du service, propriétaire du dépôt : en root, git
# refuserait un dépôt qui ne lui appartient pas (« dubious ownership »).
etape "Vérification de $etiquette sur GitHub (branche $branche)"
# La branche telle qu'elle est sur GitHub, pas une copie locale.
en_service git -C "$DEPOT" fetch --quiet --tags --force origin \
  "+refs/heads/$branche:refs/remotes/origin/$branche" \
  || echouer "branche $branche introuvable sur GitHub (a-t-elle été poussée ?)"

# GitHub fait foi : une étiquette présente seulement dans le clone du serveur
# est refusée. Pour une étiquette annotée, ls-remote donne l'objet étiquette.
distant="$(en_service git -C "$DEPOT" ls-remote --tags origin "refs/tags/$etiquette")" \
  || echouer "GitHub injoignable : impossible de vérifier l'étiquette $etiquette"
objet="$(printf '%s\n' "$distant" | awk -v ref="refs/tags/$etiquette" '$2 == ref { print $1 }')"
[ -n "$objet" ] || echouer "étiquette $etiquette absente de GitHub (git push origin $etiquette)"
[ "$(en_service git -C "$DEPOT" cat-file -t "$objet")" = "tag" ] \
  || echouer "étiquette $etiquette légère : la recréer annotée (git tag -a $etiquette -m \"…\")"

sha="$(en_service git -C "$DEPOT" rev-parse --verify --quiet "$objet^{commit}")" \
  || echouer "étiquette $etiquette illisible"
en_service git -C "$DEPOT" merge-base --is-ancestor "$sha" "refs/remotes/origin/$branche" \
  || echouer "$etiquette ($sha) n'est pas sur la branche $branche de GitHub"

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

if bash "$(fumee_de "$destination")"; then
  noter_livraison "livraison $etiquette $sha ($branche)"
  etape "$etiquette est en service."
else
  if [ -n "$precedente" ]; then
    etape "Contrôle de fumée en échec : retour à $(basename "$precedente")"
    basculer_vers "$precedente"
    en_service touch "$destination/.retiree"
    service restart
    noter_livraison "echec $etiquette $sha ($branche), retour $(basename "$precedente")"
    bash "$(fumee_de "$precedente")" || true
  else
    noter_livraison "echec $etiquette $sha ($branche, premier déploiement, rien vers quoi revenir)"
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
