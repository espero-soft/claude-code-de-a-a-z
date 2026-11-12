#!/usr/bin/env bash
# Applique sur GitHub les rulesets de main décrits dans .github/rulesets/*.json
# (SECURITE.md section 16). Idempotent : crée le ruleset s'il manque, sinon le
# remplace par le contenu du fichier (recherche par nom). Exige gh connecté avec
# un compte administrateur du dépôt. Ne pousse rien.
#
#   bash scripts/proteger-main.sh
set -euo pipefail

racine="$(git rev-parse --show-toplevel)"
cd "$racine"

for fichier in .github/rulesets/*.json; do
  nom="$(jq -r .name "$fichier")"
  id="$(gh api 'repos/{owner}/{repo}/rulesets' --paginate \
    --jq ".[] | select(.name == \"$nom\") | .id" | head -n 1)"
  if [ -z "$id" ]; then
    gh api --method POST 'repos/{owner}/{repo}/rulesets' --input "$fichier" --silent
    echo "Créé : $nom"
  else
    gh api --method PUT "repos/{owner}/{repo}/rulesets/$id" --input "$fichier" --silent
    echo "Mis à jour : $nom"
  fi
done

echo
bash "$racine/scripts/verifier-protection-main.sh"
