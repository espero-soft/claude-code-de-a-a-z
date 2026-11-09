# fil-rouge-outils

Plugin Claude Code du projet fil rouge (réservation de salles, Next.js + Prisma).

## Contenu

- Commandes : `/fil-rouge-outils:verifier` (lint puis tests, résumé en trois lignes) et `/fil-rouge-outils:regle <R1..R6>` (couverture d'une règle métier).
- Skill : `tests-regle-metier` (écrit ou complète les tests Vitest d'une règle).
- Sous-agent : `relecteur-regles` (relecture en lecture seule des règles R1 à R6 et des conventions).
- Hooks : `PreToolUse` refuse la modification d'une migration Prisma existante ; `PostToolUse` lance ESLint sur chaque fichier `.ts`/`.tsx` modifié.

Les hooks utilisent `jq` et, pour ESLint, `npx` dans le projet. Les commandes et le sous-agent s'appuient sur le tableau « Règles métier » du `CLAUDE.md` du projet.

## Installation

```bash
claude plugin marketplace add <chemin ou URL git de ce dépôt> --scope project
claude plugin install fil-rouge-outils@fil-rouge --scope project
```
