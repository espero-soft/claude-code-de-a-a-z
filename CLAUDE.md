# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Contexte

Projet fil rouge de la formation « Claude Code de A à Z » : application de réservation de salles d'un centre d'affaires (Next.js App Router, Prisma + SQLite, Tailwind). Code, identifiants, commentaires et textes d'interface sont **en français** ; garder cette convention. Les règles métier citées dans le code (R1, R2, R4, R5...) viennent du cahier des charges.

Versions figées dans `package.json` (Next 16, React 19, Prisma 7, Tailwind 4) pour rester identique aux vidéos : ne pas les mettre à jour. Les tags `fin-module-XX` marquent l'état du projet à la fin de chaque module.

## Commandes

```bash
npm run dev                  # serveur de développement (http://localhost:3000)
npm run build                # build de production
npm run lint                 # ESLint
npm test                     # Vitest, une passe (pas de fichier de config, valeurs par défaut)
npx vitest run src/lib/reservation.test.ts       # un seul fichier
npx vitest run -t "refuse le samedi"             # un seul test, par son nom

cp .env.example .env         # DATABASE_URL="file:./dev.db"
npx prisma migrate dev       # crée dev.db et applique les migrations
npx prisma migrate dev --name <changement>       # après modification du schéma
npm run db:seed              # insère les 4 salles (idempotent, upsert par slug)
npm run db:reset             # base vide, puis relancer db:seed
```

`npm install` lance `prisma generate` (postinstall). Le client Prisma est généré dans `src/generated/prisma` (ignoré par git) et s'importe depuis `@/generated/prisma/client`, pas depuis `@prisma/client`. Relancer `npx prisma generate` si ce dossier manque.

## Architecture

- **Logique métier pure dans `src/lib/`**, testée à côté (`*.test.ts`) sans base ni Next :
  - `reservation.ts` : `validerReservation(saisie, maintenant)` applique R1 (au moins 1 h, tranches de 30 min), R2 (lundi à vendredi, 8 h à 20 h) et R4 (pas dans le passé). Renvoie une union `{ ok: true, debut, fin, ... } | { ok: false, erreurs }`, avec un message par champ. `maintenant` est injecté pour que les tests soient déterministes.
  - Toutes les heures sont celles du centre, **Europe/Paris** (`FUSEAU_CENTRE`), quel que soit le fuseau du serveur. `heureDeParis(date, heure)` convertit une saisie en instant UTC en gérant les changements d'heure ; réutiliser `FUSEAU_CENTRE` pour tout affichage de date (`Intl.DateTimeFormat`).
  - `montant.ts` : `calculerMontant` (R5, prix horaire × durée).
  - `prisma.ts` : client unique (adaptateur better-sqlite3), conservé sur `globalThis` en dev.
- **Montants en centimes entiers** partout (base et calculs) ; division par 100 seulement à l'affichage. Le prix vient toujours de la base, jamais du formulaire.
- **Flux de réservation** : `salles/[id]/reserver/FormulaireReservation.tsx` (client, `useActionState`) appelle la Server Action `actions.ts` (`reserver`, liée au `salleId` par `bind`). Elle valide, renvoie `{ erreurs, valeurs }` en cas d'échec (pour ne pas vider le formulaire), sinon crée la réservation `EN_ATTENTE` et redirige vers `/reservations/[id]`.
- **Cache Components activé** (`cacheComponents: true` dans `next.config.ts`) : les pages dynamiques gardent une coquille statique et placent la lecture des données dans un composant enfant sous `<Suspense>`, qui commence par `await connection()`. `params` est une promesse, résolue via `params.then(...)` dans le Suspense ; typer avec `PageProps<"/route/[id]">`. `react.cache()` évite les doubles lectures entre `generateMetadata` et la page.
- **404 des salles** : la fiche est envoyée en flux, donc son code HTTP ne peut plus changer après coup. `src/proxy.ts` (le « middleware » de Next 16) vérifie la salle avant le rendu sur `/salles/:id` et `/salles/:id/reserver`, et réécrit vers `/salles/introuvable`, page statique qui appelle `notFound()` et affiche `salles/not-found.tsx`. Ajouter toute nouvelle route sous `/salles/[id]` au `matcher` du proxy si elle doit répondre un vrai 404.
- Une salle avec `active: false` est traitée comme inexistante (filtre `active: true` dans chaque requête).
