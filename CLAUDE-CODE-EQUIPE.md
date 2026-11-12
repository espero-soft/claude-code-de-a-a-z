# Claude Code dans l'équipe

Guide court pour qui arrive sur le projet. Les règles du code et du métier sont dans [CLAUDE.md](CLAUDE.md) ; ici, seulement ce qu'il faut savoir pour travailler avec Claude Code.

## Démarrer

```bash
nvm use                      # Node 24, comme la CI (.nvmrc)
npm ci                       # dépendances exactes du lock + client Prisma
cp .env.example .env         # puis renseigner les clés (voir ci-dessous)
npx prisma migrate dev       # crée dev.db
npm run db:seed              # les 4 salles
mailpit                      # dans un autre terminal : reçoit les codes de connexion
export STRIPE_SECRET_KEY=sk_test_…   # pour le serveur MCP stripe (il ne lit pas .env)
claude                       # accepter les serveurs MCP du projet, puis taper /accueil
```

Pour installer ou réinstaller le projet, toujours `npm ci` : il installe exactement ce que dit `package-lock.json`, repart d'un `node_modules` propre et ne réécrit jamais le lock. `npm install` le réécrit selon la version de npm de chacun (drapeaux `dev`, `peer` recalculés), ce qui ajoute du bruit aux PR : le réserver à l'ajout ou au changement volontaire d'une dépendance, commité à part avec `package.json`.

`/accueil` (ou `npm run accueil` sans Claude) vérifie tout cela et dit quoi faire pour chaque point. Il ne montre jamais une valeur de `.env`.

Dans `.env` : `STRIPE_SECRET_KEY` (clé de **test** `sk_test_…`, à demander à l'équipe), `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), et `ANTHROPIC_API_KEY` seulement pour les scripts de l'API Claude.

Ensuite, si besoin : `npm run admin:creer -- <votre e-mail>` (premier administrateur), `npx playwright install` (tests navigateur).

## Ce qui est partagé (versionné, valable pour toute l'équipe)

| Où | Quoi |
|---|---|
| `CLAUDE.md`, `AGENTS.md` | Instructions chargées à chaque session : contexte, règles R1 à R6, conventions. |
| `.claude/settings.json` | Permissions (autorisé, refusé, à confirmer) et hooks. |
| `.claude/hooks/` | Bloquent la modification d'une migration, la remise à zéro de la base et le push forcé ; lancent ESLint sur chaque fichier modifié. |
| `.claude/commands/` | `/accueil`, `/verifier` (lint et tests), `/regle R3` (couverture d'une règle). |
| `.claude/skills/` | `nouvel-ecran` (page + lien + test e2e), `tests-regle-metier`. |
| `.claude/agents/` | `relecteur-regles` : relit un changement au regard de R1 à R6, en lecture seule. |
| `.mcp.json` | Serveurs MCP : `sqlite` (lecture de `dev.db`), `playwright`, `regles-metier` (maison), `stripe`. |
| `.github/workflows/` | Revue automatique des PR par Claude ; étiquette `claude` sur une PR pour lui confier le travail. « Lint et tests » (`verifications.yml`) sur chaque PR, obligatoire pour fusionner. |
| `.github/rulesets/` | Protection de `main` : pas de push direct, PR avec une approbation et tests au vert, ni forçage ni suppression (SECURITE.md section 16). |
| `plugins/`, `.claude-plugin/` | Les mêmes outils en plugin, pour **d'autres** projets. Ne pas l'installer ici (hooks en double). |

Une modification de ces fichiers passe par une PR, comme le code.

## Ce qui reste personnel (jamais commité)

- `~/.claude/settings.json`, `~/.claude/CLAUDE.md` : vos préférences, pour tous vos projets.
- `.claude/settings.local.json`, `CLAUDE.local.md` : vos préférences pour ce projet (ignorés par git). C'est là qu'on branche, par exemple, la ligne de statut `.claude/statusline.sh`.
- `~/.claude.json` : vos serveurs MCP personnels et votre accord pour ceux du projet.
- `.env` et `dev.db` : vos secrets et vos données.

## Ce qu'on ne fait jamais

- **Lire ou coller `.env`** dans une conversation, ni committer une clé. Clé Stripe **live** : jamais, nulle part.
- **Pousser en force** (`--force`, `-f`, `+branche`), dans quelque ordre que ce soit : refusé par un hook. Branche en retard : `git pull --rebase`, puis `git push`.
- **Vider la base** (`db:reset`, `prisma migrate reset`) par Claude : refusé par un hook. Si c'est vraiment nécessaire, lancez-le vous-même.
- **Modifier une migration existante** : changer `prisma/schema.prisma`, puis `npx prisma migrate dev --name <changement>`.
- **Mettre à jour les versions** de `package.json` : elles sont figées.
- **Contourner une permission ou un hook** (autre écriture de la commande, `bash -c`...) : s'il bloque, demandez à l'équipe.
