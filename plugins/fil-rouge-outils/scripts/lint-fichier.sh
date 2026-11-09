#!/usr/bin/env bash
# Hook PostToolUse (Edit|Write) : lance ESLint sur le fichier .ts/.tsx modifié.
# En cas d'erreur, sort en code 2 avec le rapport sur stderr : Claude le reçoit
# et doit corriger le fichier.

fichier=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')

# Seulement les fichiers TypeScript existants, hors client Prisma généré.
case "$fichier" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac
[ -f "$fichier" ] || exit 0
case "$fichier" in
  */src/generated/*) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

if ! rapport=$(npx --no-install eslint --no-warn-ignored "$fichier" 2>&1); then
  {
    echo "ESLint a trouvé des problèmes dans $fichier, corrige-les :"
    echo "$rapport"
  } >&2
  exit 2
fi
exit 0
