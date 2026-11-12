#!/usr/bin/env bash
# À lancer SUR LE POSTE (pas sur le serveur) : télécharge la dernière
# sauvegarde de la base dans sauvegardes/ (ignoré par git). Décision D7 :
# copie hors du serveur sur le poste de l'administrateur, pas de stockage payant.
#
#   bash scripts/production/recuperer-sauvegarde.sh <utilisateur>@<serveur>
#
# Le compte SSH doit appartenir au groupe reunea (lecture de /var/backups/reunea).
# La copie contient des données personnelles : ne pas la partager, la supprimer
# avec le serveur à la fin du tournage.
set -euo pipefail

cible="${1:-}"
[[ "$cible" =~ ^[A-Za-z0-9._-]+@[A-Za-z0-9.:_-]+$ ]] \
  || { echo "usage : recuperer-sauvegarde.sh <utilisateur>@<serveur>" >&2; exit 1; }
DOSSIER_DISTANT="${REUNEA_SAUVEGARDES:-/var/backups/reunea}"
DOSSIER_LOCAL="$(cd "$(dirname "$0")/../.." && pwd)/sauvegardes"

derniere="$(ssh "$cible" "ls -1t '$DOSSIER_DISTANT'/reunea-*.db.gz 2>/dev/null | head -n 1")"
[ -n "$derniere" ] || { echo "aucune sauvegarde sur $cible:$DOSSIER_DISTANT" >&2; exit 1; }

mkdir -p "$DOSSIER_LOCAL"
chmod 700 "$DOSSIER_LOCAL"
scp -q "$cible:$derniere" "$DOSSIER_LOCAL/"
fichier="$DOSSIER_LOCAL/$(basename "$derniere")"
chmod 600 "$fichier"

# Vérifie la copie reçue (décompressée à part, effacée ensuite).
temporaire="$(mktemp)"
trap 'rm -f "$temporaire"' EXIT
gzip -dc "$fichier" >"$temporaire"
verification="$(sqlite3 -readonly "$temporaire" "PRAGMA integrity_check;" || true)"
[ "$verification" = "ok" ] || { echo "copie corrompue : $fichier" >&2; exit 1; }
echo "Sauvegarde récupérée et vérifiée : $fichier"
