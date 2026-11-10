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
npm test                     # Vitest, une passe (vitest.config.mts : alias @ vers ./src)
npx vitest run src/lib/reservation.test.ts       # un seul fichier
npx vitest run -t "refuse le samedi"             # un seul test, par son nom

cp .env.example .env         # puis renseigner STRIPE_SECRET_KEY (clé de test)
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
| R3 | Deux réservations confirmées ne peuvent pas se chevaucher sur la même salle. | Oui : `conflitConfirme` (`src/lib/chevauchement.ts`) et la requête partagée `trouverConflitConfirme` (`src/lib/conflit-confirme.ts`), appelée dans `reserver` (`actions.ts`), avant d'ouvrir le paiement (`ouvrirPaiement`) et dans la transaction de `confirmerReservation` (`src/lib/confirmation.ts`), lancée après un paiement vérifié. Seules les `CONFIRMEE` bloquent un créneau ; un paiement arrivé sur un créneau pris entre-temps est remboursé. |
| R4 | On ne peut pas réserver dans le passé. | Oui : `validerReservation` (`src/lib/reservation.ts`) |
| R5 | Le montant = prix par heure x durée. | Oui : `calculerMontant` (`src/lib/montant.ts`), appelé dans `reserver` (`actions.ts`) ; Stripe Checkout encaisse ce montant relu en base, et `decisionPaiement` vérifie le montant payé. |
| R6 | Une réservation en attente de paiement depuis plus de 15 minutes est annulée automatiquement. | Oui, **à la consultation et au paiement** (pas de tâche planifiée) : `estExpiree` (`src/lib/expiration.ts`), `decisionPaiement` (`src/lib/paiement.ts`), appliquée par `actualiserReservation` (`src/lib/suivi-paiement.ts`). Une réservation jamais consultée reste `EN_ATTENTE` en base, mais ne bloque rien (seules les `CONFIRMEE` comptent pour R3). |

## Architecture

- **Logique métier pure dans `src/lib/`**, testée à côté (`*.test.ts`) sans base ni Next. `validerReservation(saisie, maintenant)` renvoie `{ ok: true, ... } | { ok: false, erreurs }` (un message par champ) ; `maintenant` est injecté pour des tests déterministes.
- Toutes les heures sont celles du centre, **Europe/Paris** (`FUSEAU_CENTRE`), quel que soit le fuseau du serveur : passer par `heureDeParis` pour convertir une saisie, et `FUSEAU_CENTRE` pour tout affichage de date.
- **Montants en centimes entiers** partout (base et calculs) ; division par 100 seulement à l'affichage. Le prix vient toujours de la base, jamais du formulaire.
- **Flux de réservation** : `salles/[id]/reserver/FormulaireReservation.tsx` (client, `useActionState`) appelle la Server Action `actions.ts` (`reserver`, liée au `salleId` par `bind`). Elle valide, renvoie `{ erreurs, valeurs }` en cas d'échec (pour ne pas vider le formulaire), sinon crée la réservation `EN_ATTENTE` et redirige vers `/reservations/[id]`.
- **Paiement (Stripe Checkout, mode test, sans webhook)** : la page `/reservations/[id]` d'une réservation `EN_ATTENTE` affiche le bouton « Payer » (`BoutonPayer.tsx`, `useActionState`) qui appelle la Server Action `payer` (`reservations/[id]/actions.ts`), puis `ouvrirPaiement` (`src/lib/suivi-paiement.ts`) : R6 et R3 vérifiées, session Checkout créée au montant de la base (`client_reference_id` = id de la réservation), son id enregistré dans `Reservation.stripeSessionId`, redirection vers Stripe. Stripe renvoie sur `/reservations/[id]` ; à chaque consultation, `actualiserReservation` relit la session **auprès de Stripe** (rien du navigateur n'est cru) et applique `decisionPaiement` (fonction pure, `src/lib/paiement.ts`) : confirmer via `confirmerReservation`, annuler (R6, en fermant d'abord la session ouverte) ou rembourser puis annuler (paiement encaissé après 15 min, mauvais montant, créneau pris). Le délai R6 d'un paiement se mesure à l'encaissement (date de la charge), pas au retour du client. Clé `STRIPE_SECRET_KEY` (test uniquement, `sk_test_…`) lue par `obtenirStripe` (`src/lib/stripe.ts`) ; carte de test `4242 4242 4242 4242`. SDK `stripe` 23 : `allowed_payment_method_types` remplace `payment_method_types`.
- **Cache Components activé** (`cacheComponents: true` dans `next.config.ts`) : les pages dynamiques gardent une coquille statique et placent la lecture des données dans un composant enfant sous `<Suspense>`, qui commence par `await connection()`. `params` est une promesse, résolue via `params.then(...)` dans le Suspense ; typer avec `PageProps<"/route/[id]">`. `react.cache()` évite les doubles lectures entre `generateMetadata` et la page.
- **404 des salles** : la fiche est envoyée en flux, donc son code HTTP ne peut plus changer après coup. `src/proxy.ts` (le « middleware » de Next 16) vérifie la salle avant le rendu sur `/salles/:id` et `/salles/:id/reserver`, et réécrit vers `/salles/introuvable`, page statique qui appelle `notFound()` et affiche `salles/not-found.tsx`. Ajouter toute nouvelle route sous `/salles/[id]` au `matcher` du proxy si elle doit répondre un vrai 404.
- Une salle avec `active: false` est traitée comme inexistante (filtre `active: true` dans chaque requête).
- **Design (charte Réunéa, `design/charte.md`)** : jetons de `design/tokens.json` en variables `@theme` dans `globals.css` (`bg-marine`, `text-cuivre`, `font-titres`, `text-titre-1`, `rounded-arrondi-m`, `shadow-carte`...), polices Playfair Display et Manrope par `next/font` dans `layout.tsx`. Composants communs dans `src/components/` (`Bouton`/`LienBouton`, `Champ`/`ChampListe`, `Badge`/`BadgeStatut`, `Encadre`, `Carte`, `Logo`, `EnTete`, `PiedDePage`, icônes SVG en ligne) : les réutiliser plutôt que recopier des classes. Liens de navigation dans `src/components/liens-navigation.ts`.

## Sécurité

Permissions définies dans `.claude/settings.json` (partagé via git, donc valables pour tout le monde). Ordre d'évaluation : `deny` l'emporte sur `ask`, qui l'emporte sur `allow`.

- **Autorisé sans confirmation** : `npm run lint`, `npm test`, `npx vitest` (avec ou sans arguments), `git status`, `git diff`, `git log` (lecture seule).
- **Toujours refusé** : `git push --force` et `git push -f`, `rm -rf` et `rm -fr`, et la lecture de `.env` (secrets ; s'appuyer sur `.env.example`).
- **Confirmation demandée** : tout autre `git push`, et `git reset --hard`.

Ces règles portent sur des formes exactes de commande (préfixe) : une autre écriture (`git push origin main --force`, `rm -r -f`) n'est pas couverte par le refus. Ne pas chercher à les contourner ; demander à l'utilisateur.
