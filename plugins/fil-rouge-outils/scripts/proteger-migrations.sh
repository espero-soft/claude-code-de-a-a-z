#!/usr/bin/env bash
# Hook PreToolUse (Edit|Write|MultiEdit) : interdit de modifier un fichier
# existant de prisma/migrations. Une migration déjà appliquée ne se modifie
# pas : on change prisma/schema.prisma puis on en crée une nouvelle avec
# `npx prisma migrate dev --name <changement>`.
# Sort en code 2 avec l'explication sur stderr : l'outil est bloqué et Claude
# reçoit le message.

fichier=$(jq -r '.tool_input.file_path // empty')
[ -n "$fichier" ] || exit 0

# Chemin relatif : le rattacher à la racine du projet.
case "$fichier" in
  /*) ;;
  *) fichier="${CLAUDE_PROJECT_DIR:-.}/$fichier" ;;
esac

case "$fichier" in
  */prisma/migrations/*) ;;
  *) exit 0 ;;
esac

# Seuls les fichiers existants sont protégés (une migration déjà générée).
[ -e "$fichier" ] || exit 0

{
  echo "Modification refusée : $fichier fait partie d'une migration Prisma existante."
  echo "Une migration déjà appliquée ne se modifie pas (sinon la base et l'historique divergent)."
  echo "Modifie prisma/schema.prisma, puis crée une nouvelle migration :"
  echo "  npx prisma migrate dev --name <changement>"
} >&2
exit 2
