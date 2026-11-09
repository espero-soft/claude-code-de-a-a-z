#!/usr/bin/env bash
# Ligne de statut de Claude Code : modèle, branche git, contexte utilisé.
# Claude Code envoie la session en JSON sur stdin ; on affiche une seule ligne.

entree=$(cat)

modele=$(jq -r '.model.display_name // .model.id // "?"' <<<"$entree")
dossier=$(jq -r '.workspace.current_dir // .cwd // "."' <<<"$entree")
contexte=$(jq -r '.context_window.used_percentage // empty' <<<"$entree")

branche=$(git -C "$dossier" --no-optional-locks branch --show-current 2>/dev/null)
[ -z "$branche" ] && branche=$(git -C "$dossier" --no-optional-locks rev-parse --short HEAD 2>/dev/null)

ligne="🤖 $modele"
[ -n "$branche" ] && ligne="$ligne | 🌿 $branche"
if [ -n "$contexte" ]; then
  ligne="$ligne | 🧠 $(printf '%.0f' "$contexte") % du contexte"
else
  ligne="$ligne | 🧠 contexte : 0 %"
fi

printf '%s\n' "$ligne"
