# Sécurité : inventaire et choix de l'authentification (module 12)

Ce document accompagne le module 12. Il dresse l'inventaire de ce qu'il faut protéger, compare deux voies pour l'authentification, en retient une (Better Auth, section 6) et consigne la décision du formateur sur le mode de connexion : **sans mot de passe, par code à 6 chiffres envoyé par e-mail** (section 7).

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
| **Visiteur** | Personne non connectée | Consulter l'accueil, les salles, leurs fiches et l'aide. Se connecter par code e-mail, ce qui crée le compte au premier code. |
| **Client** | Compte créé par un code e-mail validé (l'e-mail est donc vérifié) | Tout ce que fait le visiteur, plus : réserver, consulter et payer **ses propres** réservations, gérer son compte (nom, sessions ouvertes). |
| **Employé** | Conseiller du centre | Lire et valider les tickets du support. Consulter les réservations de tous les clients pour répondre au support. Code d'application d'authentification (TOTP) **obligatoire**, en plus du code e-mail. |
| **Administrateur** | Responsable du centre | Tout ce que fait l'employé, plus : gérer les comptes et leurs rôles, et à terme les salles (activation, prix). Code TOTP **obligatoire**, en plus du code e-mail. |

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
| *À créer :* `/connexion` (un seul écran : e-mail, puis code ; sert aussi d'inscription) | ✅ | ↪︎ | ↪︎ | ↪︎ | Une personne déjà connectée est redirigée. Débit limité. |
| *À créer plus tard :* `/double-authentification` (enrôlement et saisie du code TOTP) | ❌ | ❌ | ✅ | ✅ | Employés et admins seulement. |

### 3.2 Server Actions et points d'entrée

Une Server Action est un point d'entrée HTTP **public** : on peut l'appeler en POST sans passer par la page. Masquer un bouton ne protège rien, et chaque action doit refaire sa propre vérification.

| Action | Qui | Vérification à ajouter dans l'action |
|---|---|---|
| `reserver(salleId)` | Client | Session valide et e-mail vérifié. `nomClient` et `emailClient` viennent **du compte**, plus du formulaire. La réservation est rattachée à l'identifiant de l'utilisateur. |
| `payer(reservationId)` | Client titulaire | La réservation appartient à l'utilisateur connecté (sinon même réponse que pour une réservation inexistante). |
| `actualiserReservation` (lancée à l'affichage de `/reservations/[id]`) | Titulaire, employé, admin | Le contrôle d'accès se fait **avant** l'appel, puisque cette fonction écrit en base (confirmation, annulation, remboursement). |
| `validerBrouillon(ticketId)` | Employé, admin | Rôle vérifié dans l'action. Le nom du conseiller qui valide est enregistré (traçabilité). |
| Route `/api/auth/[...all]` (**créée** : `src/app/api/auth/[...all]/route.ts`) | Tous | Gérée par la bibliothèque : débit limité, origine vérifiée (CSRF), cookies `HttpOnly`. |
| Scripts `scripts/*.ts` et serveur MCP `regles-metier` | Développeur, en local | Hors application web : ils ne sont pas exposés. On n'y change rien, mais on n'utilise jamais de vraies données. |

### 3.3 Données

| Donnée | Sensibilité | Qui peut la lire |
|---|---|---|
| `Reservation.nomClient`, `emailClient` | Personnelle (RGPD) | Le titulaire, les employés, les admins |
| `Reservation.stripeSessionId`, montant, statut | Liée au paiement | Les mêmes. L'identifiant Stripe n'est jamais affiché. |
| `Ticket.message`, `email`, `resume`, `brouillon` | Personnelle, parfois sensible (le client écrit ce qu'il veut) | Les employés et les admins seulement |
| Comptes (tables `user` et `account`) : e-mail, nom, à terme rôle | Personnelle | La personne elle-même, les admins |
| Sessions (`session`), codes de connexion (`verification`, **empreintes** seulement), à terme secrets TOTP et codes de secours | **Secrète** | Personne, pas même un admin : jamais affichés ni journalisés |
| Code reçu par e-mail | **Secrète** pendant ses 5 minutes de validité | Le destinataire seulement. L'application ne l'écrit jamais dans ses journaux. |
| `.env` (Stripe, Anthropic, secret d'authentification) | **Secrète** | Le serveur seulement |

## 4. Règles à respecter dans le projet

Elles viennent du guide de Next 16 (`node_modules/next/dist/docs/01-app/02-guides/authentication.md` et `authentication-with-cache-components.md`) et de notre architecture :

1. **Vérifier au plus près des données.** Une couche d'accès unique (`src/lib/acces.ts`, par exemple) expose `exigerSession()`, `exigerRole("EMPLOYE")` et `peutVoirReservation(utilisateur, reservation)`. Les deux premières sont mémorisées avec `react.cache()`. Les pages, les Server Actions et les fonctions de `src/lib/` passent par elle. Les règles d'accès sont des **fonctions pures testées avec Vitest**, comme R1 à R6.
2. **Le proxy (`src/proxy.ts`) ne fait qu'un contrôle optimiste.** Il peut rediriger un visiteur sans cookie de session vers `/connexion`, mais ce n'est pas une barrière : la doc de Next précise qu'il ne doit pas servir de solution d'autorisation. On garde sa vérification actuelle des salles et on ajoute les nouvelles routes à son `matcher`.
3. **Cache Components.** La session se lit au moment de la requête, donc **dans un composant sous `<Suspense>`**, après `await connection()`, comme nos lectures de données actuelles. Aucune donnée personnelle ni aucun cookie dans un `"use cache"`, une clé de cache ou un `cacheTag`. La coquille statique de `/reservations/[id]` et de `/admin/tickets` ne doit rien contenir de personnel.
4. **Pas d'énumération.** Une réservation d'un autre client répond comme une réservation inexistante (404). L'envoi d'un code répond toujours pareil, que le compte existe ou non (il n'y a d'ailleurs pas d'inscription distincte), et l'e-mail part sans être attendu, pour que le temps de réponse ne trahisse rien.
5. **Code TOTP obligatoire** pour les rôles employé et administrateur (section 7.3). Pas de second facteur pour les clients à ce stade : le code e-mail prouve déjà la possession de la boîte.
6. **Réservations existantes** (sans compte) : on les rattache au compte dont l'e-mail est identique. Avec la connexion par code, tout compte a un e-mail vérifié dès sa création (`emailVerified = true`) ; le code de rattachement le revérifie quand même.

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

Critères : auto-hébergée (les comptes restent dans **notre** base SQLite), adaptateur Prisma, compatible Next 16 (App Router, Server Actions), et prise en charge de la vérification d'e-mail, de la connexion par code e-mail et de la 2FA. (La comparaison ci-dessous a été faite avant la décision de la section 7 ; elle reste valable.)

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

## 7. Décision : connexion sans mot de passe, par code e-mail

**Décision du formateur (module 12).** Il n'y a pas de mot de passe. Un seul écran « Connexion » sert à se connecter **et** à s'inscrire : on saisit son e-mail, on reçoit un code à 6 chiffres, on le saisit, et c'est fait. Le compte est créé au premier code validé. Pour l'employé et l'administrateur, on ajoutera plus tard un code d'application d'authentification (TOTP), **obligatoire**.

### 7.1 Raisons

1. **Aucun mot de passe à protéger.** Pas d'empreintes à stocker, donc rien à voler ni à casser hors ligne si la base fuit. Les attaques les plus courantes disparaissent : réutilisation d'un mot de passe fuité ailleurs (*credential stuffing*), mots de passe faibles, hameçonnage d'un mot de passe durable.
2. **Moins de parcours, donc moins de failles.** Plus d'inscription séparée, de vérification d'e-mail ni de « mot de passe oublié » : trois écrans et trois familles de jetons en moins. Le flux de réinitialisation est historiquement l'un des plus attaqués (jetons réutilisables, énumération des comptes).
3. **L'e-mail est vérifié d'office.** Recevoir le code prouve qu'on lit la boîte : chaque compte a un e-mail vérifié dès sa création. On ne réserve plus au nom de quelqu'un d'autre, et le rattachement des anciennes réservations par e-mail (section 4, règle 6) devient sûr.
4. **Pas d'énumération par construction.** « Envoyer un code » répond toujours de la même façon, que le compte existe ou non.
5. **Adapté à l'usage.** Un client réserve une salle de temps en temps : il ne retiendrait pas un mot de passe et finirait de toute façon par « mot de passe oublié », c'est-à-dire par un e-mail. Autant en faire le chemin normal.
6. **Le second facteur porte là où est le risque.** Un employé ou un admin lit les tickets et les données de tous les clients : pour eux, la boîte e-mail seule ne suffit pas, d'où le TOTP obligatoire. Un code TOTP vient de l'appareil, pas de la boîte e-mail : compromettre l'un ne suffit pas.

### 7.2 Ce que l'on accepte, et comment on le compense

| Risque | Compensation |
|---|---|
| La sécurité du compte client = celle de sa boîte e-mail | Acceptable pour un client (c'était déjà le cas avec « mot de passe oublié »). TOTP obligatoire pour les rôles sensibles. |
| Code à 6 chiffres = 10⁶ possibilités, devinable en force brute | 3 essais par code, puis il est invalidé ; validité de 5 minutes ; à usage unique ; **par adresse e-mail** : 3 codes par quart d'heure et 10 essais par heure, tous codes confondus (section 10). La limite de Better Auth par adresse IP (en production) ne suffit pas : l'IP est lue dans un en-tête que le client choisit. |
| Le code transite par e-mail | Valable 5 minutes et une seule fois. Stocké en base sous forme d'**empreinte** (`storeOTP: "hashed"`), jamais en clair. |
| Un e-mail lent ou en indésirables bloque la connexion | Renvoi d'un code possible (débit limité). En développement, tout arrive dans Mailpit. |
| Un tiers peut faire envoyer des codes à une adresse (nuisance) | Limitation de débit ; le message dit d'ignorer l'e-mail si l'on n'a rien demandé. |

### 7.3 TOTP pour les employés et les admins : point d'attention

L'extension `twoFactor` de Better Auth 1.7.14 **ne s'applique qu'aux connexions par mot de passe** (`/sign-in/email`, `/sign-in/username`, `/sign-in/phone-number`, vérifié dans `node_modules/better-auth/dist/plugins/two-factor/index.mjs`). Elle ne s'enclenche **pas** après `/sign-in/email-otp`. Le jour où l'on ajoute le TOTP, il faudra donc l'imposer nous-mêmes :

- garder `twoFactor` pour l'enrôlement (secret, QR code, codes de secours) et la vérification du code ;
- marquer la session comme « TOTP vérifié » seulement après cette vérification ;
- faire refuser par `exigerRole("EMPLOYE")` (couche d'accès, section 4) toute session d'employé ou d'admin non marquée, avec une redirection vers `/double-authentification` ;
- tester ce refus avec Vitest (fonction pure) et Playwright.

Revérifier ce comportement à chaque mise à jour de Better Auth : une version future pourrait couvrir `email-otp`.

## 8. Installation (faite)

**Versions vérifiées sur npm le 10 novembre 2026**, figées sans `^` dans `package.json` :

| Paquet | Version | Pourquoi celle-ci |
|---|---|---|
| `better-auth` | 1.7.14 (26 octobre 2026) | Dépendances paires : `next` ^14 \|\| ^15 \|\| ^16, `react` et `react-dom` ^18 \|\| ^19, `prisma` et `@prisma/client` ^5 \|\| ^6 \|\| ^7 : compatibles avec Next 16.4.5, React 19.3.0 et Prisma 7.10.1 (`npm ls` sans conflit). Les 1.7.19 et 1.7.20 ont été publiées le jour même : on garde une version avec deux semaines de recul. |
| `auth` (dev) | 1.7.14 | La CLI de Better Auth. L'ancien paquet `@better-auth/cli` est **abandonné** sur npm. Même version que la bibliothèque. |
| `nodemailer` | 10.3.1 | Envoi SMTP vers Mailpit. Les 10.4.1 et 10.5.0 dataient du jour même. |
| `@types/nodemailer` (dev) | 8.0.2 | Types. |

Ce qui est en place :

- `src/lib/auth.ts` : instance Better Auth, adaptateur Prisma (`provider: "sqlite"`, notre client de `src/lib/prisma.ts`), extension `emailOTP` (6 chiffres, 5 minutes, 3 essais, code stocké en empreinte, inscription au premier code), `nextCookies()` en dernier. Pas d'`emailAndPassword`. Limitation de débit stockée **en base** (table `rateLimit`) plutôt qu'en mémoire, pour survivre aux redémarrages ; Better Auth ne l'active qu'en production.
- `src/lib/courriel.ts` : envoi SMTP par `nodemailer`. En développement, Mailpit (`localhost:1025`, boîte sur http://localhost:8025) ; en production, `SMTP_HOST` est exigé.
- Tables `user`, `session`, `account`, `verification` et `rateLimit` générées par `npx auth generate --config src/lib/auth.ts --output prisma/schema.prisma`, migration `authentification`.
- Route `src/app/api/auth/[...all]/route.ts` (`toNextJsHandler`).
- `.env.example` : `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SMTP_*`, `COURRIEL_EXPEDITEUR`.

Vérifié sur un serveur de production local : `/api/auth/ok` répond 200, `/api/auth/get-session` répond `null` sans cookie, une requête d'une autre origine est refusée (403 `INVALID_ORIGIN`), le code arrive dans Mailpit, la base ne contient que son empreinte, un mauvais code est refusé, le bon crée le compte (`emailVerified: true`) et pose un cookie de session `HttpOnly`, et le même code rejoué est refusé.

Pièges rencontrés :

- **Prisma 7 ne régénère plus le client après `migrate dev`.** Better Auth lit le modèle du client généré et signale « Prisma schema mismatch » tant qu'on n'a pas lancé `npx prisma generate`. Un `next dev` déjà lancé garde l'ancien client sur `globalThis` : le redémarrer.
- **Valeurs par défaut de `emailOTP` à corriger** : le code est stocké **en clair** par défaut (`storeOTP: "plain"`).
- La CLI réécrit tout `schema.prisma` et peut détacher les commentaires des modèles : relire le diff.

## 9. Suite du plan

1. ~~Installer Better Auth, générer et migrer le schéma, créer la route `/api/auth/[...all]`.~~ Fait (section 8).
2. Écrire la couche d'accès `src/lib/acces.ts` (fonctions pures plus lecture de session) et ses tests Vitest.
3. Écran `/connexion` (e-mail, puis code), avec le client `better-auth/react` et l'extension cliente `emailOTPClient`.
4. Ajouter `Reservation.utilisateurId`, protéger `reserver`, `payer` et `/reservations/[id]`, créer `/compte/reservations`. Le nom et l'e-mail de la réservation viennent du compte.
5. Rôles (extension `admin` ou champ `role`) ; remplacer `adminDisponible()` par `exigerRole("EMPLOYE")` sur `/admin/tickets` et `validerBrouillon` ; afficher le lien « Tickets » selon le rôle dans `liens-navigation.ts`.
6. TOTP obligatoire pour employés et admins (section 7.3).
7. Tests Playwright (`e2e/`) : un visiteur est redirigé, un client ne voit pas la réservation d'un autre (404), un client n'ouvre pas `/admin/tickets`, et l'action `validerBrouillon` appelée sans rôle est refusée.
8. Mettre à jour `CLAUDE.md` (architecture, nouvelles variables d'environnement) et la section « Sécurité ».

## 10. Attaques contre la connexion par code (module 12)

Attaques menées comme un pirate, directement sur les routes HTTP `/api/auth/...` (sans l'écran), contre le serveur de développement et contre un build de production (`next start`, où la limite de Better Auth est active). Chacune est rejouée par `e2e/attaques-connexion.spec.ts`. Sans les parades, les trois tests des failles échouent ; avec elles, tout passe.

| Attaque | Résultat avant | Verdict | Parade |
|---|---|---|---|
| Faux code, code jamais demandé | `400 INVALID_OTP` | Tient | - |
| Code expiré | `400 OTP_EXPIRED`, puis code effacé (`INVALID_OTP` si on le rejoue) | Tient | - |
| 3 faux essais, puis le bon code | `403 TOO_MANY_ATTEMPTS` au 4e | Tient | - |
| 20 demandes de code vers la même adresse | Dev : 20 e-mails. Production : 3, puis `429`… mais **20 e-mails** en changeant `X-Forwarded-For` à chaque requête | **Faille** | Limite par adresse e-mail : 3 codes par quart d'heure |
| Force brute : nouveau code + 3 essais, en boucle | Production, `X-Forwarded-For` changé à chaque tour : 30 essais sur 10 codes, aucun refus. Sans plafond, environ 333 000 codes suffisent pour essayer les 10⁶ valeurs | **Faille** | Limite par adresse e-mail : 10 essais par heure, tous codes confondus (moins de 1 chance sur 4 000 par jour) |
| Le serveur trahit-il un compte ? Réponses de `send-verification-otp` (`sign-in`) | Identiques (`200 {"success":true}`), temps médian 9 ms contre 10 ms | Tient | - |
| Idem, type `forget-password` puis 4 faux codes sur `/email-otp/check-verification-otp` | Compte existant : `400 400 400 403`. Adresse inconnue : `400 400 400 400`. Aucun e-mail ne part : la victime ne voit rien | **Faille** (énumération silencieuse) | Routes de code inutilisées fermées (`disabledPaths`, 404) ; seul le type `sign-in` est accepté |

Mise en place :

- `src/lib/limite-connexion.ts` (pur, testé) : règles `LIMITE_ENVOIS` et `LIMITE_ESSAIS`, décision `deciderLimite` en fenêtre fixe, clé par adresse en minuscules.
- `src/lib/garde-connexion.ts` : extension Better Auth (crochets `before`/`after`, valables en HTTP comme par `auth.api`). Compte avant d'envoyer ou de vérifier, refuse en `429` avec un code (`TROP_DE_CODES_DEMANDES`, `TROP_D_ESSAIS_SUR_CETTE_ADRESSE`), le délai restant et `Retry-After`. Une connexion réussie remet le compteur d'essais à zéro. Écriture atomique (on écrit seulement si la ligne n'a pas changé depuis sa lecture) ; en cas de doute, on refuse.
- Table `LimiteConnexion`, **distincte** de `rateLimit` : Better Auth purge dans `rateLimit` toute ligne plus vieille que sa plus longue fenêtre (60 s), quelle que soit sa clé. Des compteurs d'une heure y seraient effacés au bout d'une minute.
- `src/lib/connexion.ts` : messages en français pour ces deux refus, avec le délai en minutes.
- `e2e/vieillir-connexion.ts` simule le temps qui passe (code expiré, fenêtre écoulée) ; `e2e/nettoyage.ts` efface aussi les compteurs et les comptes de test.

Ce que l'on accepte, et ce qui reste à faire :

- **Blocage ciblé.** Un pirate peut épuiser les essais d'une victime : elle ne peut plus se connecter pendant au plus une heure. On le préfère à la prise de contrôle du compte.
- **IP falsifiable en production.** Better Auth croit un `X-Forwarded-For` à une seule valeur, et `next start` le transmet tel quel. La limite par IP ne protège donc rien tant que le déploiement ne la fiabilise pas : mettre l'application derrière un proxy qui **réécrit** cet en-tête (ou ajoute l'IP réelle en dernier, avec `advanced.ipAddress.trustedProxies`). Sinon, un pirate peut toujours faire envoyer des codes à **beaucoup d'adresses différentes** (3 chacune). À trancher au choix de l'hébergement.
- Vérifié et écarté : sur une même machine, tous les visiteurs partagent le compteur d'IP `::1`. Ce n'est pas un compteur commun à tout le monde en production : Next.js renseigne l'IP de la connexion quand l'en-tête manque.
