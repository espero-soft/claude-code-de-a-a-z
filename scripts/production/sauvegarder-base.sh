#!/usr/bin/env bash
# Sauvegarde à chaud de la base SQLite de production (design/PLAN-PRODUCTION.md, section 6).
#
#   scripts/production/sauvegarder-base.sh            # sauvegarde horaire (timer systemd)
#   scripts/production/sauvegarder-base.sh <motif>    # sauvegarde nommée, ex. avant-v2026.11.12-1
#
# Jamais `cp` sur une base ouverte : la commande .backup de SQLite produit une
# copie cohérente même pendant une écriture. La copie est vérifiée
# (PRAGMA integrity_check) avant d'être gardée, puis compressée.
# Conservation : horaires 48 h ; nommées, les 5 dernières.
set -euo pipefail
source "$(dirname "$0")/commun.sh"

motif="${1:-}"
if [ -n "$motif" ] && ! [[ "$motif" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echouer "motif invalide (lettres, chiffres, point, tiret) : $motif"
fi

[ -f "$REUNEA_BASE" ] || echouer "base introuvable : $REUNEA_BASE"
command -v sqlite3 >/dev/null || echouer "sqlite3 n'est pas installé (apt install sqlite3)"

umask 027
mkdir -p "$REUNEA_SAUVEGARDES"
horodatage="$(date -u +%Y%m%dT%H%M%SZ)"
nom="reunea-$horodatage${motif:+-$motif}.db"
temporaire="$REUNEA_SAUVEGARDES/.$nom.en-cours"
trap 'rm -f "$temporaire" "$temporaire.gz"' EXIT

# .timeout : attend jusqu'à 10 s qu'une écriture en cours se termine.
sqlite3 "$REUNEA_BASE" ".timeout 10000" ".backup '$temporaire'"
verification="$(sqlite3 "$temporaire" "PRAGMA integrity_check;")"
[ "$verification" = "ok" ] || echouer "copie corrompue (integrity_check : $verification), sauvegarde abandonnée"

gzip -9 "$temporaire"
mv "$temporaire.gz" "$REUNEA_SAUVEGARDES/$nom.gz"
chmod 640 "$REUNEA_SAUVEGARDES/$nom.gz"
echo "Sauvegarde : $REUNEA_SAUVEGARDES/$nom.gz"

# Horaires (sans motif : le nom finit par Z.db.gz) de plus de 48 h.
find "$REUNEA_SAUVEGARDES" -maxdepth 1 -name 'reunea-*Z.db.gz' -mmin +2880 -delete
# Nommées : les 5 plus récentes seulement. `|| true` : sans sauvegarde
# nommée, ls échoue, et pipefail ferait passer la sauvegarde pour ratée.
nommees="$(ls -1t "$REUNEA_SAUVEGARDES"/reunea-*Z-*.db.gz 2>/dev/null || true)"
printf '%s\n' "$nommees" | tail -n +6 | while read -r ancienne; do
  if [ -n "$ancienne" ]; then rm -f "$ancienne"; fi
done
