# Sécurité : inventaire et choix de l'authentification (module 12)

Ce document prépare le module 12. Il ne modifie pas le code : il dresse l'inventaire de ce qu'il faut protéger, compare deux voies pour l'authentification et en recommande une.

## 1. État des lieux (fin du module 11)

L'application n'a **ni comptes ni sessions**. Les protections actuelles sont les suivantes :

| Élément | Protection actuelle | Limite |
|---|---|---|
| `/admin/tickets` et l'action `validerBrouillon` | `adminDisponible()` (`src/lib/admin-tickets.ts`) : ouvert seulement si `NODE_ENV === "development"`. En production, la page répond 404 et l'action refuse. | Ce n'est pas un contrôle d'accès : en développement, **n'importe qui** qui atteint le serveur lit les messages et les e-mails des clients. En production, **personne** ne peut traiter les tickets, même pas les conseillers. Une erreur de variable d'environnement suffit à tout ouvrir. |
| `/reservations/[id]` | L'identifiant est un cuid difficile à deviner : c'est une « URL secrète ». | Quiconque obtient le lien (historique, capture d'écran, lien transmis, journaux) voit le **nom, l'e-mail**, la salle, le créneau et le montant, et peut cliquer sur « Payer ». Rien ne relie la réservation à une personne. |
| `reserver` (`salles/[id]/reserver/actions.ts`) | Validation R1, R2, R4 et R3. Prix relu en base. | Le nom et l'e-mail sont saisis librement : on peut réserver au nom de quelqu'un d'autre, et l'adresse n'est jamais vérifiée. Aucune limite de débit. |
| `payer` (`reservations/[id]/actions.ts`) | Next vérifie l'en-tête `Origin` des Server Actions. R6 et R3 sont revérifiées. Le paiement est relu auprès de Stripe. | Aucune vérification que l'appelant est le titulaire de la réservation. |
| Secrets (`STRIPE_SECRET_KEY`, `ANTHROPIC_API_KEY`) | `.env*` est ignoré par git, et sa lecture est refusée dans `.claude/settings.json`. | Correct. Un futur secret d'authentification suivra la même règle. |
| Base `dev.db` | Ignorée par git, hors de `public/`. | Elle contient toutes les données personnelles. Le serveur MCP `sqlite` (`.mcp.json`) la lit en développement : n'y mettre que des données fictives. |

Ce qui est déjà solide et doit le rester : le prix vient toujours de la base, le paiement est vérifié côté serveur auprès de Stripe, et l'`Origin` des Server Actions est contrôlé par Next.

## 2. Les rôles

| Rôle | Qui | Ce qu'il doit pouvoir faire |
|---|---|---|
| **Visiteur** | Personne non connectée | Consulter l'accueil, les salles, leurs fiches et l'aide. Créer un compte, se connecter, demander un nouveau mot de passe. |
| **Client** | Compte vérifié (e-mail confirmé) | Tout ce que fait le visiteur, plus : réserver, consulter et payer **ses propres** réservations, gérer son compte (mot de passe, double authentification). |
| **Employé** | Conseiller du centre | Lire et valider les tickets du support. Consulter les réservations de tous les clients pour répondre au support. Double authentification **obligatoire**. |
| **Administrateur** | Responsable du centre | Tout ce que fait l'employé, plus : gérer les comptes et leurs rôles, et à terme les salles (activation, prix). Double authentification **obligatoire**. |

Un compte a un seul rôle, et chaque rôle inclut le précédent. Le rôle est stocké en base et lu côté serveur à chaque requête : il n'est jamais déduit d'une donnée envoyée par le navigateur.

## 3. Inventaire de ce qu'il faut protéger

### 3.1 Pages

| Route | Visiteur | Client | Employé | Admin | Remarque |
|---|:-:|:-:|:-:|:-:|---|
| `/`, `/salles`, `/salles/[id]`, `/aide` | ✅ | ✅ | ✅ | ✅ | Restent publiques et statiques. |
| `/salles/[id]/reserver` | ↪︎ connexion | ✅ | ✅ | ✅ | Le visiteur est renvoyé vers la connexion, puis ramené au formulaire. |
| `/reservations/[id]` | ❌ | ✅ si titulaire | ✅ | ✅ | Le client qui n'est pas titulaire reçoit un **404**, pas un 403 : on ne confirme pas que la réservation existe. |
| `/admin/tickets` | ❌ | ❌ | ✅ | ✅ | Remplace le garde `adminDisponible()`. |
| *À créer :* `/compte`, `/compte/reservations` | ❌ | ✅ | ✅ | ✅ | Le client retrouve ses réservations sans garder de lien. |
| *À créer :* `/admin/utilisateurs` | ❌ | ❌ | ❌ | ✅ | Attribution des rôles. |
| *À créer :* `/connexion`, `/inscription`, `/mot-de-passe-oublie`, `/verification-email`, `/double-authentification` | ✅ | ↪︎ | ↪︎ | ↪︎ | Une personne déjà connectée est redirigée. Débit limité. |

### 3.2 Server Actions et points d'entrée

Une Server Action est un point d'entrée HTTP **public** : on peut l'appeler en POST sans passer par la page. Masquer un bouton ne protège rien, et chaque action doit refaire sa propre vérification.

| Action | Qui | Vérification à ajouter dans l'action |
|---|---|---|
| `reserver(salleId)` | Client | Session valide et e-mail vérifié. `nomClient` et `emailClient` viennent **du compte**, plus du formulaire. La réservation est rattachée à l'identifiant de l'utilisateur. |
| `payer(reservationId)` | Client titulaire | La réservation appartient à l'utilisateur connecté (sinon même réponse que pour une réservation inexistante). |
| `actualiserReservation` (lancée à l'affichage de `/reservations/[id]`) | Titulaire, employé, admin | Le contrôle d'accès se fait **avant** l'appel, puisque cette fonction écrit en base (confirmation, annulation, remboursement). |
| `validerBrouillon(ticketId)` | Employé, admin | Rôle vérifié dans l'action. Le nom du conseiller qui valide est enregistré (traçabilité). |
| *À créer :* route `/api/auth/...` de la bibliothèque | Tous | Gérée par la bibliothèque : débit limité, protection CSRF, cookies sécurisés. |
| Scripts `scripts/*.ts` et serveur MCP `regles-metier` | Développeur, en local | Hors application web : ils ne sont pas exposés. On n'y change rien, mais on n'utilise jamais de vraies données. |

### 3.3 Données

| Donnée | Sensibilité | Qui peut la lire |
|---|---|---|
| `Reservation.nomClient`, `emailClient` | Personnelle (RGPD) | Le titulaire, les employés, les admins |
| `Reservation.stripeSessionId`, montant, statut | Liée au paiement | Les mêmes. L'identifiant Stripe n'est jamais affiché. |
| `Ticket.message`, `email`, `resume`, `brouillon` | Personnelle, parfois sensible (le client écrit ce qu'il veut) | Les employés et les admins seulement |
| *À créer :* comptes (e-mail, rôle) | Personnelle | La personne elle-même, les admins |
| *À créer :* empreintes de mot de passe, sessions, secrets TOTP, codes de secours, jetons de vérification et de réinitialisation | **Secrète** | Personne, pas même un admin : jamais affichées ni journalisées |
| `.env` (Stripe, Anthropic, secret d'authentification) | **Secrète** | Le serveur seulement |

## 4. Règles à respecter dans le projet

Elles viennent du guide de Next 16 (`node_modules/next/dist/docs/01-app/02-guides/authentication.md` et `authentication-with-cache-components.md`) et de notre architecture :

1. **Vérifier au plus près des données.** Une couche d'accès unique (`src/lib/acces.ts`, par exemple) expose `exigerSession()`, `exigerRole("EMPLOYE")` et `peutVoirReservation(utilisateur, reservation)`. Les deux premières sont mémorisées avec `react.cache()`. Les pages, les Server Actions et les fonctions de `src/lib/` passent par elle. Les règles d'accès sont des **fonctions pures testées avec Vitest**, comme R1 à R6.
2. **Le proxy (`src/proxy.ts`) ne fait qu'un contrôle optimiste.** Il peut rediriger un visiteur sans cookie de session vers `/connexion`, mais ce n'est pas une barrière : la doc de Next précise qu'il ne doit pas servir de solution d'autorisation. On garde sa vérification actuelle des salles et on ajoute les nouvelles routes à son `matcher`.
3. **Cache Components.** La session se lit au moment de la requête, donc **dans un composant sous `<Suspense>`**, après `await connection()`, comme nos lectures de données actuelles. Aucune donnée personnelle ni aucun cookie dans un `"use cache"`, une clé de cache ou un `cacheTag`. La coquille statique de `/reservations/[id]` et de `/admin/tickets` ne doit rien contenir de personnel.
4. **Pas d'énumération.** Une réservation d'un autre client répond comme une réservation inexistante (404). « Mot de passe oublié » répond toujours « si un compte existe, un e-mail a été envoyé ».
5. **Double authentification obligatoire** pour les rôles employé et administrateur, et proposée aux clients.
6. **Réservations existantes** (sans compte) : à la migration, on les rattache au compte dont l'e-mail **vérifié** est identique. Avant cette vérification, rien n'est rattaché.

## 5. Deux voies pour l'authentification

### Voie A : coder nous-mêmes

Le guide de Next le montre à titre pédagogique : formulaire, Server Action, empreinte du mot de passe, session chiffrée dans un cookie (`jose` ou `iron-session`) ou stockée en base. Pour notre cahier des charges, il faudrait écrire, tester et maintenir :

- le stockage des mots de passe (algorithme lent et salé : argon2id ou scrypt, avec les bons paramètres) ;
- les sessions : création, expiration, renouvellement, révocation à la déconnexion et au changement de mot de passe, attributs des cookies (`HttpOnly`, `Secure`, `SameSite`) ;
- la vérification de l'e-mail : jeton aléatoire, usage unique, expiration, stockage de son empreinte ;
- le mot de passe oublié : même chose, plus l'invalidation des sessions ouvertes et la non-énumération des comptes ;
- la double authentification : secret TOTP (RFC 6238), QR code, tolérance d'horloge, anti-rejeu, codes de secours, récupération ;
- la limitation de débit sur la connexion, l'inscription et l'envoi d'e-mails ;
- les rôles et leur vérification.

| Pour | Contre |
|---|---|
| Aucune dépendance, compréhension totale du code | Beaucoup de code de sécurité : chaque oubli (jeton réutilisable, comparaison non constante, session non révoquée) est une faille |
| Pédagogique pour comprendre les mécanismes | Aucun regard extérieur sur ce code : pas d'audit, pas de correctifs publiés par d'autres |
| | La 2FA et la récupération de compte représentent à elles seules un chantier |
| | Le guide de Next lui-même recommande une bibliothèque « pour plus de sécurité et de simplicité » |

### Voie B : une bibliothèque reconnue

Critères : auto-hébergée (les comptes restent dans **notre** base SQLite), adaptateur Prisma, compatible Next 16 (App Router, Server Actions), et prise en charge de la vérification d'e-mail, du mot de passe oublié et de la 2FA.

| Bibliothèque | Auto-hébergée, Prisma + SQLite | Vérif. e-mail, mot de passe oublié | 2FA | Rôles | Verdict |
|---|---|---|---|---|---|
| **Better Auth** | Oui (`prismaAdapter`, `provider: "sqlite"`, schéma généré par sa CLI) | Oui, intégrés (`requireEmailVerification`, `sendResetPassword`) | Oui, extension `twoFactor` (TOTP, code par e-mail, codes de secours) | Oui, extension `admin` (rôles, bannissement, révocation de sessions) | **Couvre tout le besoin** |
| Auth.js (NextAuth v5) | Oui (adaptateur Prisma) | Non pour le mot de passe : le fournisseur `Credentials` est volontairement minimal, tout est à coder | Non | À coder | Revient presque à la voie A pour notre besoin. Le projet est désormais maintenu par l'équipe de Better Auth. |
| Lucia | - | - | - | - | Abandonnée en tant que bibliothèque (2025). Elle reste un bon guide pour la voie A. |
| Clerk, Auth0, Descope, Stack Auth (services hébergés) | Non : les comptes sont chez le prestataire | Oui | Oui | Oui | Fonctionnel, mais données personnelles chez un tiers, coût par utilisateur, dépendance à un service externe. Hors sujet pour une formation sur SQLite et Prisma. |

## 6. Recommandation : Better Auth

**On choisit la voie B avec Better Auth.**

1. **Elle couvre les trois exigences sans code de sécurité maison** : vérification de l'e-mail, mot de passe oublié et double authentification (TOTP avec codes de secours) sont fournis, documentés et testés par d'autres. Il nous reste à écrire l'envoi des e-mails et les écrans.
2. **Elle respecte notre pile** : les tables `User`, `Session`, `Account` et `Verification` (plus celle de la 2FA) sont générées dans `prisma/schema.prisma` et appliquées par `prisma migrate dev`, avec notre client Prisma existant (`src/lib/prisma.ts`, adaptateur `better-sqlite3`). Les données restent dans SQLite, rien ne part chez un tiers.
3. **Elle s'intègre à Next 16** : un gestionnaire de route (`src/app/api/auth/[...all]/route.ts`), l'extension `nextCookies` pour poser les cookies depuis une Server Action, et `auth.api.getSession({ headers: await headers() })` côté serveur, appelable dans nos composants sous `<Suspense>`.
4. **Les rôles sont prévus** (extension `admin`) : client, employé, administrateur, sans table maison.
5. **Les protections de base sont actives par défaut** : empreinte scrypt, limitation de débit sur les routes d'authentification, cookies `HttpOnly`/`Secure`/`SameSite`, vérification de l'origine des requêtes (CSRF), et possibilité de révoquer les autres sessions au changement de mot de passe (à activer et à tester).
6. **Elle est citée par la documentation de Next** dans sa liste de bibliothèques d'authentification.

Ce que la bibliothèque **ne fait pas** à notre place, et qui reste notre travail :

- **l'autorisation métier** (« ce client est-il titulaire de cette réservation ? », « ce rôle peut-il valider un ticket ? ») : c'est la couche d'accès de la section 4, avec ses tests ;
- **l'envoi des e-mails** : il faut un transport SMTP. En développement, on affiche les liens dans la console ou on utilise un serveur SMTP local de test (Mailpit) ;
- **les écrans** de connexion, d'inscription et de 2FA, avec la charte Réunéa et nos composants (`Champ`, `Bouton`, `Encadre`).

Précautions à l'installation :

- figer la version exacte dans `package.json`, comme le reste du projet, et vérifier ses dépendances paires (Next 16, React 19, Prisma 7) ;
- ajouter `BETTER_AUTH_SECRET` et `BETTER_AUTH_URL` à `.env.example` (sans valeur réelle), et le secret dans `.env` ;
- vérifier que le schéma généré s'accorde avec notre générateur `prisma-client` (sortie dans `src/generated/prisma`) ;
- relire la doc de Next de `node_modules/next/dist/docs/` à chaque étape (proxy, Cache Components), puisque cette version diffère de celles qu'on connaît.

## 7. Plan de mise en œuvre proposé

1. Installer Better Auth, générer et migrer le schéma (`npx prisma migrate dev --name authentification`), créer la route `/api/auth/[...all]`.
2. Écrire la couche d'accès `src/lib/acces.ts` (fonctions pures plus lecture de session) et ses tests Vitest.
3. Écrans `/inscription`, `/connexion`, `/verification-email` et `/mot-de-passe-oublie`, avec l'envoi d'e-mails en développement.
4. Ajouter `Reservation.utilisateurId`, protéger `reserver`, `payer` et `/reservations/[id]`, créer `/compte/reservations`.
5. Remplacer `adminDisponible()` par `exigerRole("EMPLOYE")` sur `/admin/tickets` et `validerBrouillon` ; afficher le lien « Tickets » selon le rôle dans `liens-navigation.ts`.
6. Double authentification : obligatoire pour employés et admins, proposée aux clients.
7. Tests Playwright (`e2e/`) : un visiteur est redirigé, un client ne voit pas la réservation d'un autre (404), un client n'ouvre pas `/admin/tickets`, et l'action `validerBrouillon` appelée sans rôle est refusée.
8. Mettre à jour `CLAUDE.md` (architecture, nouvelles variables d'environnement) et la section « Sécurité ».
