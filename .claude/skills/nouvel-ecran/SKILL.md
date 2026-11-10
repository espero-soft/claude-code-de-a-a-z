---
name: nouvel-ecran
description: Ajoute une nouvelle page (un écran) à l'application en suivant les conventions du projet : fichier page.tsx au bon endroit de src/app avec le schéma Cache Components de CLAUDE.md, lien dans la navigation commune, test Playwright dans e2e/. À utiliser dès qu'on demande de créer, ajouter ou faire une page, un écran ou une route visible (« ajoute une page Mes réservations », « crée l'écran /tarifs », « il faut une page de contact »). Ne pas utiliser pour modifier une page existante, pour un simple composant sans route, pour une Server Action ou une route API (route.ts), ni pour des tests Vitest de règle métier (skill tests-regle-metier).
argument-hint: <route et objet de l'écran, ex. /reservations « Mes réservations »>
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(npm run lint), Bash(npm test), Bash(npx vitest run:*), Bash(npx playwright test:*), Bash(npm run test:e2e:*), Bash(npm run build)
---

# Nouvel écran

Écran demandé : **$ARGUMENTS**. Si la route ou l'objet de la page manque, le demander avant d'écrire quoi que ce soit. Si la route existe déjà dans `src/app`, le dire et s'arrêter (ce skill crée, il ne modifie pas une page existante).

Un écran n'est terminé que lorsque les **trois livrables** existent : la page, son lien de navigation, son test Playwright. Ne pas en livrer un sans les autres.

## Démarche

1. **Lire la doc de la version installée** (AGENTS.md : ce Next n'est pas celui de l'entraînement). Au minimum, dans `node_modules/next/dist/docs/01-app/01-getting-started/` : `03-layouts-and-pages.md`, `04-linking-and-navigating.md`, `06-fetching-data.md`, `08-caching.md`, et `16-proxy.md` si la route est sous `/salles/[id]`. Tenir compte des avertissements de dépréciation.
2. **Relire un modèle** avant d'écrire :
   - page sans paramètre qui lit la base : `src/app/salles/page.tsx` ;
   - page avec `[id]` : `src/app/salles/[id]/page.tsx` (et `src/proxy.ts`) ;
   - page avec formulaire : `src/app/salles/[id]/reserver/` (client `useActionState` + `actions.ts`).
3. **Annoncer le plan** en quelques lignes : chemin du fichier, page statique ou dynamique, données lues, intitulé du lien de navigation, nom du fichier de test. Puis écrire.
4. Écrire la page, puis la navigation, puis le test (détails ci-dessous).
5. **Vérifier** : `npm run lint`, `npm test`, puis `npx playwright test e2e/<fichier>.spec.ts` (le serveur `npm run dev` est démarré ou réutilisé par `playwright.config.ts` ; `npm run db:seed` doit avoir été lancé). Ne jamais affaiblir un test pour le faire passer.
6. **Compte rendu** (voir en bas).

## 1. La page

**Emplacement**
- `src/app/<segment>/page.tsx`, segments en français, en minuscules, avec tirets (`/mes-reservations`, `/salles/[id]/planning`). Paramètre dynamique : `[id]`.
- Composants propres à l'écran rangés **à côté** de la page (`src/app/<segment>/MonComposant.tsx`, comme `FormulaireReservation.tsx`), en PascalCase français. Server Action dans `actions.ts` du même dossier.
- Toute logique métier (calcul, validation, règle R1 à R6) va dans `src/lib/` en fonction pure, testée en Vitest à côté ; la page ne fait qu'afficher.

**Schéma Cache Components** (`cacheComponents: true`) : coquille statique, données en flux.
- Le composant de page par défaut **n'est pas `async`** et ne lit rien : il rend `<main>`, le titre `<h1>`, le texte fixe, puis un `<Suspense fallback={...}>` avec un message de chargement en français (« Chargement des … »).
- La lecture des données se fait dans un **composant enfant `async`** placé sous le `<Suspense>`, qui commence par `await connection()` (import depuis `next/server`). Sans cela, better-sqlite3 répond de façon synchrone et Next figerait les données au build.
- Route avec paramètre : `params` est une promesse. Typer avec `PageProps<"/route/[id]">` et la résoudre **dans** le Suspense : `{params.then(({ id }) => <Contenu id={id} />)}`. Ne pas faire `await params` dans le composant de page.
- Si `generateMetadata` et la page lisent la même donnée, l'envelopper dans `cache()` de React (avec `await connection()` dedans), comme `lireSalle`.
- Page sans donnée : pas de Suspense ni de `connection()`, simple composant serveur.
- `metadata` (ou `generateMetadata`) exporté, `title` et `description` en français.
- Pas de `"use client"` sur la page : seul un composant enfant interactif l'est.

**Données et affichage**
- Client Prisma importé depuis `@/lib/prisma` (jamais `@prisma/client` ni `@/generated/...` directement dans une page).
- Salles : toujours filtrer `active: true` ; une salle inactive est inexistante.
- Montants en centimes en base ; diviser par 100 **seulement** à l'affichage, via `Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" })`.
- Dates affichées avec `timeZone: FUSEAU_CENTRE` (Europe/Paris) ; toute saisie convertie par `heureDeParis`.
- Prévoir l'état vide avec une phrase en français (« Aucune … pour le moment. »).

**404**
- Route sous `/salles/[id]/...` qui doit répondre un vrai 404 : ajouter son motif au `matcher` de `src/proxy.ts` (la fiche part en flux, son code HTTP ne peut plus changer ensuite) et garder `notFound()` dans le composant de données pour le cas rare.
- Autre ressource avec `[id]` : `notFound()` dans le composant de données, et signaler dans le compte rendu que le code HTTP restera 200 sans équivalent du proxy.

**Style** (Tailwind, reprendre les pages existantes)
- `<main className="flex-1 bg-slate-50 px-6 py-16 text-slate-900">` puis `<div className="mx-auto max-w-3xl">` (ou `max-w-5xl` pour une grille).
- `<h1 className="text-4xl font-bold tracking-tight">`, accent `orange-600`, cartes `rounded-2xl border border-slate-200 bg-white p-6 shadow-sm`.
- Textes en français avec apostrophes échappées (`&apos;`), heures écrites « 8 h », « 9 h 30 ».

## 2. La navigation

- La barre de navigation commune est le composant `src/app/Navigation.tsx`, rendu une seule fois dans `src/app/layout.tsx`, au-dessus de `{children}`, dans un `<header>` contenant `<nav aria-label="Navigation principale">`.
- **S'il n'existe pas encore**, le créer à la première page ajoutée :
  - liste `<ul>` de `<Link>` (`next/link`) ; entrées de départ « Accueil » (`/`) et « Salles » (`/salles`), puis le nouvel écran ;
  - les liens sont décrits dans un tableau `const LIENS = [{ href, libelle }]`, pour qu'ajouter un écran ne touche qu'une ligne ;
  - lien courant marqué `aria-current="page"` (via `usePathname`, donc `"use client"` sur ce seul composant) ; pour `/salles`, actif aussi sur les sous-routes ;
  - style sobre cohérent : fond blanc, bordure basse `border-slate-200`, lien actif `text-orange-600`.
- **S'il existe**, ajouter une seule entrée dans `LIENS`, à une place logique dans le parcours.
- Une page de détail (`[id]`) ou une étape de parcours (`/reserver`) **ne va pas** dans la navigation : on y arrive par un lien de la page parente. Dans ce cas, ajouter ce lien dans la page parente à la place, et le dire.
- Les liens de retour « ← … » existants dans les pages restent en place.

## 3. Le test Playwright

- Fichier `e2e/<segment>.spec.ts` (ex. `e2e/mes-reservations.spec.ts`), en-tête en commentaire français : ce que vérifie le parcours et ses prérequis (`npm run db:seed`).
- Imports : `import { expect, test } from "@playwright/test";`. Dates de démonstration via `dateDemo()` de `src/lib/date-demo.ts`, jamais une date en dur.
- Le parcours **part de l'accueil et passe par la navigation** : `page.goto("/")`, clic sur `page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "<libellé>" })`, puis `expect(page).toHaveURL(...)`. Pour une page de détail, partir de la page parente et cliquer son lien.
- Vérifier au moins : le titre (`getByRole("heading", { name: ... })`), le contenu principal tiré du seed, le lien de navigation marqué `aria-current="page"`.
- Sélecteurs par rôle, libellé ou texte (`getByRole`, `getByLabel`, `getByText`) ; pas de sélecteur CSS ni de `data-testid`. Pour une alerte, filtrer par texte (Next ajoute sa propre zone `role="alert"`).
- Montants : attendre le texte formaté en euros (`/^40,00\s€$/`, l'espace avant « € » est insécable), ce qui attrape un oubli de division par 100.
- Route `[id]` protégée par le proxy : ajouter un test qui vérifie qu'un identifiant inconnu répond 404 (`const reponse = await page.goto("/salles/inconnu/..."); expect(reponse?.status()).toBe(404);`).
- Si le test écrit en base, utiliser l'e-mail `playwright@example.com` et `e2e/nettoyage.ts` en `beforeAll`/`afterAll`, comme `e2e/r3-chevauchement.spec.ts`.
- `it`/`test` nommés en français, au présent : `test("affiche les salles depuis la navigation", ...)`.

## Compte rendu

En quelques lignes :
- fichiers créés ou modifiés (page, composants, `Navigation.tsx`/`layout.tsx`, `proxy.ts` le cas échéant, spec) ;
- page statique ou dynamique, et pourquoi ;
- résultat de `npm run lint`, `npm test` et du test Playwright (ou la raison s'il n'a pas pu tourner) ;
- toute section de `CLAUDE.md` à mettre à jour (Architecture, route ajoutée au proxy) : la signaler sans la modifier sans accord.
