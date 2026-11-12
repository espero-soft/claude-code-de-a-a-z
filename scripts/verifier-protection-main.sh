#!/usr/bin/env bash
# Preuve, en lecture seule, que main est protégée : lit les règles que GitHub
# APPLIQUE réellement à main (GET /rules/branches/main, toutes sources confondues)
# et le contournement de chaque ruleset. Échoue si une règle attendue manque.
# N'affiche aucun nom de compte, ne pousse rien.
#
#   bash scripts/verifier-protection-main.sh
set -euo pipefail

regles="$(gh api 'repos/{owner}/{repo}/rules/branches/main' --paginate)"

echo "Règles appliquées à main :"
echo "$regles" | jq -r '.[] |
  if .type == "pull_request" then
    "- pull_request : \(.parameters.required_approving_review_count) approbation(s), approbations périmées annulées : \(.parameters.dismiss_stale_reviews_on_push), approbation après le dernier push : \(.parameters.require_last_push_approval)"
  elif .type == "required_status_checks" then
    "- required_status_checks : \([.parameters.required_status_checks[].context] | join(", ")) (branche à jour exigée : \(.parameters.strict_required_status_checks_policy))"
  else "- \(.type)" end'

echo
echo "Contournements autorisés, par ruleset :"
for id in $(echo "$regles" | jq -r '[.[].ruleset_id] | unique | .[]'); do
  gh api "repos/{owner}/{repo}/rulesets/$id" --jq '
    "- \(.name) [\(.enforcement)] : " +
    (if (.bypass_actors | length) == 0 then "aucun, administrateur compris"
     else ([.bypass_actors[] |
       (if .actor_type == "RepositoryRole" and .actor_id == 5 then "rôle administrateur du dépôt"
        else .actor_type end)
       + " (" + (if .bypass_mode == "pull_request" then "seulement en fusionnant une PR" else .bypass_mode end) + ")"]
       | join(", ")) end)'
done

manquantes=""
for attendue in deletion non_fast_forward pull_request required_status_checks; do
  echo "$regles" | jq -e --arg t "$attendue" 'any(.[]; .type == $t)' > /dev/null \
    || manquantes="$manquantes $attendue"
done
echo "$regles" | jq -e 'any(.[]; .type == "required_status_checks"
  and any(.parameters.required_status_checks[]; .context == "Lint et tests"))' > /dev/null \
  || manquantes="$manquantes contrôle « Lint et tests »"

echo
if [ -n "$manquantes" ]; then
  echo "ÉCHEC : règles absentes sur main :$manquantes"
  exit 1
fi
echo "OK : main est protégée (aucune écriture n'a été faite pour le vérifier)."
