#!/usr/bin/env bash
# Hook PreToolUse (Bash) : interdit les commandes qui vident la base de
# développement (npm run db:reset, prisma migrate reset, prisma db push
# --force-reset). dev.db contient les données de l'utilisateur (salles,
# réservations saisies à la main) : les effacer n'est pas réversible.
# Sort en code 2 avec l'explication sur stderr : l'outil est bloqué et Claude
# reçoit le message.

commande=$(jq -r '.tool_input.command // empty')
[ -n "$commande" ] || exit 0

# Espaces multiples, tabulations et retours à la ligne ramenés à un espace.
commande=$(printf '%s' "$commande" | tr -s '[:space:]' ' ')

motif='(^|[^[:alnum:]_:-])(db:reset|prisma migrate reset|prisma db push .*--force-reset)([^[:alnum:]_:-]|$)'
printf '%s' "$commande" | grep -Eq -- "$motif" || exit 0

{
  echo "Commande refusée : elle vide la base de développement (dev.db)."
  echo "Pourquoi : la base contient les données de l'utilisateur (réservations, salles modifiées) ;"
  echo "une réinitialisation les efface définitivement, sans retour arrière possible."
  echo "À la place :"
  echo "  - après une modification du schéma : npx prisma migrate dev --name <changement>"
  echo "    (applique la migration sans effacer les données) ;"
  echo "  - pour remettre les 4 salles : npm run db:seed (idempotent, upsert par slug) ;"
  echo "  - si une remise à zéro est vraiment nécessaire (migration en conflit, base corrompue),"
  echo "    explique pourquoi à l'utilisateur et demande-lui de lancer lui-même npm run db:reset."
} >&2
exit 2
