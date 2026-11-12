# Claude Code de A à Z : projet fil rouge

Ce dépôt accompagne la formation vidéo **« Claude Code de A à Z : coder avec un agent IA (2026) »**.

Tout au long de la formation, nous construisons ensemble, avec Claude Code, une **application de réservation** complète : créneaux, disponibilités, paiement Stripe en mode test, tests automatisés et mise en production.

## Prérequis

- **Node.js 20.9 ou plus récent** (version LTS conseillée, voir le fichier `.nvmrc`)
- **Git**
- **Claude Code**, installé et connecté (module 1 de la formation)

## Démarrer

```bash
git clone https://github.com/espero-soft/claude-code-de-a-a-z.git
cd claude-code-de-a-a-z
nvm use
npm ci
npm run dev
```

`npm ci` installe exactement les versions de `package-lock.json` sans le réécrire. Gardez `npm install` pour ajouter volontairement une dépendance.

Ouvrez ensuite [http://localhost:3000](http://localhost:3000) dans votre navigateur.

Vous rejoignez l'équipe ? Lisez [CLAUDE-CODE-EQUIPE.md](CLAUDE-CODE-EQUIPE.md), puis lancez `/accueil` dans Claude Code (ou `npm run accueil`) pour vérifier votre installation.

> **Important :** clonez le projet dans un dossier dont le chemin ne contient pas le caractère « : ». Sur macOS et Linux, ce caractère empêche npm de trouver ses outils (erreur `next: command not found`).

## Base de données

Le projet utilise **Prisma** avec une base **SQLite** locale (fichier `dev.db`, jamais commité).

```bash
cp .env.example .env                 # DATABASE_URL="file:./dev.db"
npx prisma migrate dev               # crée dev.db et applique les migrations
npm run db:seed                      # insère les 4 salles (relançable sans doublon)
npx prisma studio                    # facultatif : parcourir les données
```

- Après une modification de `prisma/schema.prisma` : `npx prisma migrate dev --name <nom-du-changement>`.
- Repartir d'une base vide : `npm run db:reset`, puis `npm run db:seed`.
- Les prix et montants sont stockés **en centimes** (entiers) : 25 € s'écrit `2500`.

## Mise en production

Réunéa tourne en démonstration sur un petit serveur : Ubuntu, Caddy pour le HTTPS, SQLite sur le disque, e-mails par SMTP, Stripe en mode test.

- Le plan, avec ses décisions : [design/PLAN-PRODUCTION.md](design/PLAN-PRODUCTION.md).
- L'installation pas à pas et les commandes du quotidien : [deploiement/LISEZMOI.md](deploiement/LISEZMOI.md).
- Les scripts (livrer, revenir en arrière, sauvegarder, restaurer, contrôle de fumée) : `scripts/production/`.

Une version se livre depuis une **étiquette posée sur `main`** (`v<année>.<mois>.<jour>-<n>`), jamais depuis une branche. Le serveur refuse de démarrer si sa configuration est incomplète, et `/api/sante` indique s'il répond.

## Organisation du dépôt

| Où | Contenu |
|---|---|
| Branche `main` | Le point de départ : un projet Next.js vierge, versions figées |
| Tags `fin-module-XX` | L'état du projet à la fin de chaque module (les corrigés) |

Les tags sont ajoutés au fil de la formation.

### Repartir de l'état d'un module

Vous êtes perdu, ou vous voulez reprendre à un module précis ? Créez une branche à partir du tag correspondant :

```bash
git fetch --tags
git switch -c ma-version fin-module-03
```

## La stack

- **Next.js** (App Router) et **TypeScript**
- **Tailwind CSS**
- Ajoutés pendant la formation : **Prisma** et **SQLite** (en local comme en production), **Stripe** en mode test, **Vitest** et **Playwright** pour les tests

Les versions sont figées dans `package.json`, pour que le projet reste identique à celui des vidéos.

## Le fichier AGENTS.md

Next.js a créé un fichier `AGENTS.md` destiné aux agents IA comme Claude Code. Gardez-le : nous verrons au module 3 comment il fonctionne avec `CLAUDE.md`.

## Une autre stack ?

La méthode enseignée fonctionne avec n'importe quelle stack : Laravel, Django, Symfony, Rails... Vous aimeriez voir le projet dans une autre technologie ? Dites-le dans les questions et réponses de la formation.
