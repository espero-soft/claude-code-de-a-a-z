---
description: Vérifie l'installation d'un nouveau venu (Node, dépendances, .env, base, Mailpit, tests) et dit quoi faire pour chaque point
argument-hint: "[--sans-tests]"
allowed-tools: Bash(node scripts/accueil.mjs), Bash(node scripts/accueil.mjs --sans-tests)
---

Vérifie l'installation de la personne qui arrive dans l'équipe.

Lance **une seule commande** : `node scripts/accueil.mjs $ARGUMENTS`. Ce script fait toutes les vérifications : version de Node (`.nvmrc`), dépendances et client Prisma, `.env` et ses clés, `STRIPE_SECRET_KEY` exportée pour le serveur MCP stripe, migrations appliquées et salles présentes dans `dev.db`, Mailpit (SMTP et interface web), tests Vitest. Il ne modifie rien. Un code de sortie 1 veut seulement dire qu'il reste des points « À FAIRE » : ce n'est pas une panne.

Règles strictes sur les secrets :

- **N'ouvre jamais `.env`**, ni en entier ni en partie : pas de `Read`, `cat`, `grep`, `head`, `source`, `printenv` ou `env`. Le script le lit lui-même et n'affiche que des états (« renseignée », « valeur d'exemple », « clé LIVE »...), jamais une valeur.
- Ne demande pas à la personne de te coller une clé, et ne propose pas de l'écrire toi-même dans `.env` : elle la renseigne elle-même dans son éditeur.

Ne corrige rien et n'installe rien : tu constates et tu expliques.

Pour installer les dépendances, conseille toujours `npm ci`, jamais `npm install` : `npm ci` suit exactement `package-lock.json` sans le réécrire. Si `package-lock.json` apparaît modifié dans `git status` sans ajout volontaire de dépendance, conseille `git restore package-lock.json` puis `npm ci`.

Réponds ensuite en français, sans tiret cadratin ni demi-cadratin :

1. Un tableau `| Point | État | À faire |`, une ligne par point du script, dans son ordre. État : ✅ OK, ❌ À faire, ⚠️ À surveiller. « À faire » : la commande exacte du script, ou « rien ».
2. **Par où commencer** : les points ❌ dans l'ordre où les traiter (Node, puis `npm ci`, puis `.env`, puis base, puis Mailpit, puis tests), en une liste numérotée de commandes à copier. Signale qu'il faut relancer `npm run dev` après une migration, et `/accueil` à la fin pour vérifier.
3. Si tout est ✅ : une phrase pour le dire, et renvoie vers [CLAUDE-CODE-EQUIPE.md](CLAUDE-CODE-EQUIPE.md) pour la suite (premier administrateur, tests navigateur).
