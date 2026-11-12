#!/usr/bin/env bash
# Restaure la base de production depuis une sauvegarde (design/PLAN-PRODUCTION.md, section 6.4).
#
#   sudo systemctl stop reunea
#   sudo bash scripts/production/restaurer-base.sh /var/backups/reunea/reunea-<date>.db.gz
#   cd /srv/reunea/current && sudo -u reunea npx prisma migrate status
#   sudo systemctl start reunea && bash scripts/production/fumee.sh
#
# Refuse tant que le service tourne : on n'écrit jamais sous une base ouverte.
# La base actuelle n'est jamais écrasée : elle est mise de côté d'abord.
set -euo pipefail
source "$(dirname "$0")/commun.sh"

sauvegarde="${1:-}"
[ -n "$sauvegarde" ] || echouer "usage : restaurer-base.sh <fichier .db ou .db.gz>"
[ -f "$sauvegarde" ] || echouer "sauvegarde introuvable : $sauvegarde"

if "$REUNEA_SYSTEMCTL" is-active --quiet "$REUNEA_SERVICE"; then
  echouer "le service $REUNEA_SERVICE tourne : l'arrêter d'abord (systemctl stop $REUNEA_SERVICE)"
fi

umask 077
dossier_base="$(dirname "$REUNEA_BASE")"
mkdir -p "$dossier_base" "$REUNEA_SAUVEGARDES"
temporaire="$dossier_base/.restauration-en-cours.db"
trap 'rm -f "$temporaire"' EXIT

etape "Lecture de $sauvegarde"
case "$sauvegarde" in
  *.gz) gzip -dc "$sauvegarde" >"$temporaire" ;;
  *) cp "$sauvegarde" "$temporaire" ;;
esac
verification="$(sqlite3 "$temporaire" "PRAGMA integrity_check;")"
[ "$verification" = "ok" ] || echouer "sauvegarde corrompue (integrity_check : $verification), rien n'a été touché"

if [ -f "$REUNEA_BASE" ]; then
  de_cote="$REUNEA_SAUVEGARDES/reunea-avant-restauration-$(date -u +%Y%m%dT%H%M%SZ).db"
  etape "Base actuelle mise de côté : $de_cote"
  cp "$REUNEA_BASE" "$de_cote"
  chmod 640 "$de_cote"
fi
# Journal d'une transaction interrompue : il appartient à l'ancienne base.
rm -f "$REUNEA_BASE-journal" "$REUNEA_BASE-wal" "$REUNEA_BASE-shm"

mv "$temporaire" "$REUNEA_BASE"
chmod 600 "$REUNEA_BASE"
if [ "$(id -u)" = "0" ]; then chown "$REUNEA_UTILISATEUR:$REUNEA_UTILISATEUR" "$REUNEA_BASE"; fi

etape "Base restaurée. Ensuite :"
echo "  1. cd $COURANTE && sudo -u $REUNEA_UTILISATEUR npx prisma migrate status   (le schéma doit correspondre à la version en service)"
echo "  2. sudo systemctl start $REUNEA_SERVICE && bash $(dirname "$0")/fumee.sh"
echo "  3. Paiements Stripe faits depuis la sauvegarde : à relever dans le tableau de bord Stripe."
