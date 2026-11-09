# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Contexte

Projet fil rouge de la formation « Claude Code de A à Z » : application de réservation de salles d'un centre d'affaires (Next.js App Router, Prisma + SQLite, Tailwind). Code, identifiants, commentaires et textes d'interface sont **en français** ; garder cette convention.

Versions figées dans `package.json` (Next 16, React 19, Prisma 7, Tailwind 4) pour rester identique aux vidéos : ne pas les mettre à jour. Les tags `fin-module-XX` marquent l'état du projet à la fin de chaque module.

## Commandes

```bash
npm run dev                  # serveur de développement (http://localhost:3000)
npm run build                # build de production
npm run lint                 # ESLint
npm test                     # Vitest, une passe (pas de fichier de config, valeurs par défaut)
npx vitest run src/lib/reservation.test.ts       # un seul fichier
npx vitest run -t "refuse le samedi"             # un seul test, par son nom

cp .env.example .env
npx prisma migrate dev       # crée dev.db et applique les migrations
npx prisma migrate dev --name <changement>       # après modification du schéma
npm run db:seed              # insère les 4 salles (idempotent, upsert par slug)
npm run db:reset             # base vide, puis relancer db:seed
```

`npm install` lance `prisma generate` (postinstall). Le client Prisma est généré dans `src/generated/prisma` (ignoré par git) et s'importe depuis `@/generated/prisma/client`, pas depuis `@prisma/client`. Relancer `npx prisma generate` si ce dossier manque.

## Règles métier (cahier des charges)

Texte exact du cahier des charges ; le code y renvoie par leur numéro (« R1 »...).

| Règle | Texte | Codée ? |
|---|---|---|
| R1 | Une réservation dure au minimum 1 heure, par tranches de 30 minutes. | Oui : `validerReservation` (`src/lib/reservation.ts`) |
| R2 | Le centre est ouvert du lundi au vendredi, de 8 h à 20 h. | Oui : `validerReservation` (`src/lib/reservation.ts`) |
| R3 | Deux réservations confirmées ne peuvent pas se chevaucher sur la même salle. | **En partie**, en attendant le paiement : `conflitConfirme` (`src/lib/chevauchement.ts`) et la requête partagée `trouverConflitConfirme` (`src/lib/conflit-confirme.ts`), appelée dans `reserver` (`actions.ts`) et dans la transaction de `confirmerReservation` (`src/lib/confirmation.ts`). Seules les `CONFIRMEE` bloquent un créneau, or rien n'appelle encore `confirmerReservation` (elle attend le paiement de R6) : aucune réservation ne devient `CONFIRMEE`, donc la vérification ne bloque rien dans l'application pour l'instant. |
| R4 | On ne peut pas réserver dans le passé. | Oui : `validerReservation` (`src/lib/reservation.ts`) |
| R5 | Le montant = prix par heure x durée. | Oui : `calculerMontant` (`src/lib/montant.ts`), appelé dans `reserver` (`actions.ts`) |
| R6 | Une réservation en attente de paiement depuis plus de 15 minutes est annulée automatiquement. | **Non** (pas de paiement ni de tâche ; `createdAt` et `ANNULEE` existent dans le schéma) |

## Architecture

- **Logique métier pure dans `src/lib/`**, testée à côté (`*.test.ts`) sans base ni Next. `validerReservation(saisie, maintenant)` renvoie `{ ok: true, ... } | { ok: false, erreurs }` (un message par champ) ; `maintenant` est injecté pour des tests déterministes.
- Toutes les heures sont celles du centre, **Europe/Paris** (`FUSEAU_CENTRE`), quel que soit le fuseau du serveur : passer par `heureDeParis` pour convertir une saisie, et `FUSEAU_CENTRE` pour tout affichage de date.
- **Montants en centimes entiers** partout (base et calculs) ; division par 100 seulement à l'affichage. Le prix vient toujours de la base, jamais du formulaire.
- **Flux de réservation** : `salles/[id]/reserver/FormulaireReservation.tsx` (client, `useActionState`) appelle la Server Action `actions.ts` (`reserver`, liée au `salleId` par `bind`). Elle valide, renvoie `{ erreurs, valeurs }` en cas d'échec (pour ne pas vider le formulaire), sinon crée la réservation `EN_ATTENTE` et redirige vers `/reservations/[id]`.
- **Cache Components activé** (`cacheComponents: true` dans `next.config.ts`) : les pages dynamiques gardent une coquille statique et placent la lecture des données dans un composant enfant sous `<Suspense>`, qui commence par `await connection()`. `params` est une promesse, résolue via `params.then(...)` dans le Suspense ; typer avec `PageProps<"/route/[id]">`. `react.cache()` évite les doubles lectures entre `generateMetadata` et la page.
- **404 des salles** : la fiche est envoyée en flux, donc son code HTTP ne peut plus changer après coup. `src/proxy.ts` (le « middleware » de Next 16) vérifie la salle avant le rendu sur `/salles/:id` et `/salles/:id/reserver`, et réécrit vers `/salles/introuvable`, page statique qui appelle `notFound()` et affiche `salles/not-found.tsx`. Ajouter toute nouvelle route sous `/salles/[id]` au `matcher` du proxy si elle doit répondre un vrai 404.
- Une salle avec `active: false` est traitée comme inexistante (filtre `active: true` dans chaque requête).

## Sécurité

Permissions définies dans `.claude/settings.json` (partagé via git, donc valables pour tout le monde). Ordre d'évaluation : `deny` l'emporte sur `ask`, qui l'emporte sur `allow`.

- **Autorisé sans confirmation** : `npm run lint`, `npm test`, `npx vitest` (avec ou sans arguments), `git status`, `git diff`, `git log` (lecture seule).
- **Toujours refusé** : `git push --force` et `git push -f`, `rm -rf` et `rm -fr`, et la lecture de `.env` (secrets ; s'appuyer sur `.env.example`).
- **Confirmation demandée** : tout autre `git push`, et `git reset --hard`.

Ces règles portent sur des formes exactes de commande (préfixe) : une autre écriture (`git push origin main --force`, `rm -r -f`) n'est pas couverte par le refus. Ne pas chercher à les contourner ; demander à l'utilisateur.
