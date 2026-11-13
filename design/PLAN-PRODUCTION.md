# Plan de mise en production de Réunéa

Statut : **décisions prises (section 9), préparation du code faite (section 2) ; le serveur n'existe pas encore**. Plan rédigé après lecture de l'application (branche `module-12B`, commit `df7ca09`) et de la documentation de Next 16 livrée dans `node_modules/next/dist/docs/`. L'installation pas à pas est dans [deploiement/LISEZMOI.md](../deploiement/LISEZMOI.md).

Le serveur est **temporaire** : il sera supprimé après le tournage.

Choix déjà faits : un petit VPS Hetzner sous Ubuntu, facturé à l'heure, créé ensemble ; SQLite sur le disque du serveur ; HTTPS par Caddy ; un sous-domaine d'un domaine de l'entreprise ; e-mails par le SMTP de Brevo ; Stripe en mode test.

Dans ce document, `reservations.exemple.fr` remplace le sous-domaine, qui reste à choisir (décision D2).

---

## 0. Sources consultées

| Sujet | Où | Ce qu'on en retient |
|---|---|---|
| Déploiement | `01-app/01-getting-started/17-deploying.md` | `next build` puis `next start` : le serveur Node.js prend en charge **toutes** les fonctionnalités. |
| Auto-hébergement | `01-app/02-guides/self-hosting.md` | Mettre un reverse proxy devant Next. Le proxy (`src/proxy.ts`), `next/image` et Cache Components marchent avec `next start` sans configuration. Le cache est sur le disque local, ce qui suffit pour **une seule instance**. Le streaming ne doit pas être mis en tampon par le proxy. Arrêt propre sur `SIGTERM` (prévoir 10 à 30 s). `deploymentId` gère l'écart de versions. |
| CLI | `01-app/03-api-reference/06-cli/next.md` | `next start -p <port> -H <hôte>`, **hôte `0.0.0.0` par défaut**. `PORT` ne peut pas être mis dans `.env`. |
| Variables d'environnement | `01-app/02-guides/environment-variables.md` | Ordre de lecture : `process.env`, `.env.production.local`, `.env.local`, `.env.production`, `.env`. `next start` fixe `NODE_ENV=production`. Seules les variables `NEXT_PUBLIC_` vont au navigateur (le projet n'en a aucune). |
| Server Actions et origine | `01-app/03-api-reference/05-config/01-next-config-js/serverActions.md`, `01-app/02-guides/data-security.md` | Next compare l'hôte de l'en-tête `Origin` à `x-forwarded-host` ou `host`. Derrière un proxy qui transmet l'hôte public, **`allowedOrigins` n'est pas nécessaire**. |
| Proxy | `01-app/03-api-reference/03-file-conventions/proxy.md` | Le runtime Node.js est le défaut en Next 16, donc Prisma dans `src/proxy.ts` fonctionne avec `next start`. |
| `output: "standalone"` | `01-app/03-api-reference/05-config/01-next-config-js/output.md` | Utile pour Docker. Écarté ici (voir 5.1). |
| Démarrage du serveur | `self-hosting.md`, lien vers `instrumentation` | La fonction `register` s'exécute au démarrage du serveur. Elle servira à vérifier la configuration (voir 2.4). |

---

## 1. Ce qui change entre le poste de développement et la production

| Sujet | Développement (aujourd'hui) | Production |
|---|---|---|
| **Serveur** | `npm run dev` (Turbopack, rechargement à chaud) | `npm run build`, puis `next start -H localhost -p 3000` lancé par systemd et joignable **seulement par Caddy**. Pas `-H 127.0.0.1` : voir 2.12. |
| **Adresse publique** | `http://localhost:3000` | `https://reservations.exemple.fr`, avec `BETTER_AUTH_URL` réglé sur cette adresse. Comme l'URL est en HTTPS, Better Auth pose des cookies `Secure`. |
| **Base** | `dev.db` à la racine, `file:./dev.db`, remise à zéro avec `db:reset` | `/var/lib/reunea/reunea.db`, **hors du dossier de version**, chemin absolu, appartenant à l'utilisateur `reunea`. Seulement `prisma migrate deploy`, **jamais** `migrate dev` ni `migrate reset`. |
| **Données de départ** | `db:seed` : 4 salles et une réservation **CONFIRMÉE de démonstration** (`demo-r3-horizon`, un mardi à venir de 10 h à 12 h sur Horizon) | Les 4 salles seulement. La réservation de démonstration bloquerait un vrai créneau (R3) : il faut l'exclure (voir 2.1). |
| **E-mails** | Mailpit (`localhost:1025`, sans TLS ni authentification), boîte sur `:8025` | SMTP de Brevo en STARTTLS sur le port 587, avec identifiant et clé SMTP. **TLS obligatoire** (voir 2.3). Expéditeur sur le domaine de l'entreprise, avec SPF, DKIM et DMARC. Mailpit n'est **pas installé**. |
| **Secrets** | `.env` local (lecture refusée à Claude) | `/etc/reunea/reunea.env` (propriétaire `root`, groupe `reunea`, droits `640`), lié en `.env` dans chaque version. `BETTER_AUTH_SECRET` est **propre à la production** et conservé hors du serveur (voir 6.5). |
| **Stripe** | Clé `sk_test_` | Toujours une clé `sk_test_`, puisque le code refuse une clé live. L'adresse de retour devient l'adresse configurée (voir 2.2). |
| **Limite de débit Better Auth** | Inactive (défaut hors production) | **Active**. Elle compte par IP, lue dans `X-Forwarded-For`. Caddy doit donc écrire cet en-tête, et Next ne doit être joignable que par Caddy, sinon on peut fabriquer l'en-tête. Le journal (`lireIp`) dépend du même en-tête. |
| **Client Prisma** | Gardé sur `globalThis` | Une instance par processus (déjà prévu dans `src/lib/prisma.ts`). |
| **Images** | Optimisées à la volée | Pareil avec `next start`, cache dans `.next/cache/images`. Sous Linux glibc, surveiller la mémoire de `sharp` (signalé par la doc). |
| **Tests** | Vitest (`npm test`) ; Playwright sur `npm run dev` avec Mailpit et `dev.db` | Vitest et lint en CI (inchangé). **Aucun test Playwright contre la production** : ils créent des comptes, lisent Mailpit, vieillissent des connexions et écrivent dans la base. Après chaque livraison, seulement un **contrôle de fumée en lecture** (voir 7.3). |
| **Claude (API Anthropic)** | `ANTHROPIC_API_KEY` pour les scripts du module 10 | L'application web ne l'utilise pas (seuls `scripts/importer-tickets.ts` et `scripts/traiter-ticket.ts` le font). La clé n'est donc pas mise sur le serveur, sauf décision contraire (D9). |
| **Heure** | Celle du Mac | Le serveur reste en UTC : l'application convertit tout en Europe/Paris (`FUSEAU_CENTRE`). L'horloge doit être **synchronisée** (NTP), car R6 (15 minutes) et les codes TOTP (fenêtre de 30 s) en dépendent. |

---

## 2. À préparer dans le code (avant le premier déploiement)

Chaque point passe par une branche, une PR, la CI au vert et une approbation (SECURITE.md, section 16).

**État au 12 novembre 2026** (branche `module-12B`) :

| Point | État |
|---|---|
| 2.1 Seed sans démonstration | Fait : `reservationDemoAutorisee`, testé. |
| 2.2 Retour Stripe configuré | Fait : `adressePublique(BETTER_AUTH_URL)`. Un en-tête `Origin` forgé est ignoré (testé). |
| 2.3 SMTP avec TLS exigé | Fait : `optionsSmtp`, `SMTP_TLS` facultatif. |
| 2.4 Vérification au démarrage | Fait : le serveur s'arrête (code 1) si la configuration est mauvaise ; essayé avec `next start`. |
| 2.5 `/api/sante` | Fait. |
| 2.6 Identifiant de déploiement | Fait **sans code** : `NEXT_DEPLOYMENT_ID=<sha>` au build, posé par `deployer.sh` (la doc `deploymentId.md` documente cette variable). |
| 2.7 Fichiers de déploiement | Fait : `deploiement/`, et les scripts dans `scripts/production/` (pas `scripts/`), tous testés. |
| 2.8 Documentation et garde-fous | Fait : README, CLAUDE.md et les règles `ask` (décision D13). |
| 2.9 Build dans la CI | **Pas fait** : le build tourne sur le serveur avant toute bascule, donc un build cassé ne casse pas la production. À reprendre si on veut l'attraper dès la PR. |
| 2.10 Bandeau | Fait : `BandeauDemonstration` sur chaque page. |
| 2.11 Pages légales | Remplacées par la page `/demonstration` (décision D10). |
| 2.12 `-H localhost` | Ajouté après essai : voir ci-dessous. |

### 2.1 Seed sans réservation de démonstration (obligatoire)
`prisma/seed.ts` appelle toujours `insererReservationDemo()`. Il faut une option, par exemple `SEED_DEMO=1` ou une détection de `NODE_ENV=production`. Le seed de production n'insère alors **que les salles**, et la démonstration reste disponible pour les tests e2e (R3). Tarifs et descriptions sont à confirmer (D8). Le seed reste idempotent (upsert par slug) ; relancé en production, il **réécrit** prix et équipements, ce qui est voulu.

### 2.2 Adresse de retour Stripe tirée de la configuration (recommandé)
`payer` (`src/app/reservations/[id]/actions.ts`) construit `success_url` et `cancel_url` à partir de l'en-tête `Origin`. Next vérifie déjà que cet en-tête correspond à l'hôte. Il reste plus sûr et plus lisible de partir d'une adresse fixe, `BETTER_AUTH_URL` ou une variable `ADRESSE_PUBLIQUE`. Le refus actuel quand `Origin` manque disparaît alors. Penser à adapter `actions.test.ts`.

### 2.3 SMTP avec TLS obligatoire (obligatoire)
`src/lib/courriel.ts` fixe `secure: false`. Avec Brevo sur le port 587, nodemailer passe en STARTTLS si le serveur le propose, mais ne l'**exige** pas. Il faut ajouter `requireTLS: true` hors Mailpit, réglé par une variable (par exemple `SMTP_TLS=starttls|aucun`) pour garder Mailpit en développement. Option : `secure: true` sur le port 465. L'hôte, les ports et les quotas sont à relever dans le compte Brevo, pas de mémoire.

### 2.4 Vérification de la configuration au démarrage (recommandé)
Un `src/instrumentation.ts` dont la fonction `register` (citée par la doc d'auto-hébergement) refuse de démarrer en production dans ces cas :
- une variable obligatoire manque : `DATABASE_URL`, `BETTER_AUTH_SECRET` (au moins 32 caractères), `BETTER_AUTH_URL`, `SMTP_HOST`, `SMTP_UTILISATEUR`, `SMTP_MOT_DE_PASSE`, `COURRIEL_EXPEDITEUR` ou `STRIPE_SECRET_KEY` ;
- `BETTER_AUTH_URL` ne commence pas par `https://` ;
- `SMTP_HOST` vaut `localhost` (Mailpit oublié) ;
- `COURRIEL_EXPEDITEUR` est encore en `.test`.

Le message nomme la variable, **jamais sa valeur**. On découvre ainsi l'oubli au démarrage, et non au premier e-mail ou au premier paiement. La logique est pure et testée (`src/lib/configuration.ts` et son test).

### 2.5 Point de santé `/api/sante` (recommandé)
Un gestionnaire de route qui fait un `SELECT 1` sur la base et répond `200 {"ok":true}`, sans rien révéler d'autre (ni version ni chemin). Il sert au contrôle de fumée et au retour arrière automatique. Pas de surveillance externe (D11) : on le consulte à la main (`curl`).

### 2.6 Identifiant de déploiement (recommandé)
`NEXT_DEPLOYMENT_ID=<sha>` au moment du build : la doc (`05-config/01-next-config-js/deploymentId.md`) accepte cette variable à la place de `deploymentId` dans `next.config.ts`, qui reste donc inchangé. D'après la doc (section « Version Skew »), un onglet resté ouvert sur l'ancienne version fait alors un rechargement complet au lieu d'appeler des Server Actions ou des fichiers qui n'existent plus. `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` est inutile, puisqu'il n'y a qu'une instance.

### 2.7 Fichiers de déploiement versionnés (obligatoire)
Un dossier `deploiement/` contenant :
- `Caddyfile` ;
- `reunea.service` ;
- `reunea-sauvegarde.service` et `reunea-sauvegarde.timer` ;
- `reunea.env.example`, la liste des variables de production, **sans valeurs**.

Dans `scripts/` :
- `deployer.sh` ;
- `revenir.sh` ;
- `sauvegarder-base.sh` ;
- `restaurer-base.sh` ;
- `fumee.sh`, le contrôle de fumée en lecture seule.

Ces scripts vérifient leurs arguments et refusent d'écrire sur une base ouverte par le service.

### 2.8 Documentation et garde-fous Claude Code
- Une section « Production » dans `README.md` et `CLAUDE.md` : commandes de livraison et de retour arrière, et rappel qu'on n'utilise jamais `migrate dev` ni `db:reset` sur le serveur.
- `.claude/settings.json` : mettre en `ask` `ssh`, `scp` et `rsync` vers le serveur, et les scripts de déploiement et de restauration, pour que Claude ne touche jamais la production sans confirmation. L'ajout d'un hook est à décider (D13).

### 2.9 Build dans la CI (recommandé)
Ajouter une étape `npm run build` au job « Lint et tests » de `.github/workflows/verifications.yml` sans **renommer** le job, sinon le ruleset bloque les fusions. Le build attrape ce que lint et Vitest laissent passer : erreurs de rendu, Suspense manquant avec Cache Components.

### 2.10 Bandeau « paiement de démonstration »
Ce point dépend de D1. Tant que Stripe est en mode test, le site doit dire clairement qu'aucun paiement réel n'est pris.

### 2.11 Pages légales
Ce point dépend de D10. Mentions légales et politique de confidentialité sont attendues dès l'ouverture au public : comptes, e-mails, journal des connexions conservé 90 jours, adresses IP.

### 2.12 Écouter sur `localhost`, pas sur `127.0.0.1` (constaté à l'essai)
Avec `next start -H 127.0.0.1`, Next 16.4.5 traite les réécritures de `src/proxy.ts` comme des appels vers un site extérieur. C'est le cas de `NextResponse.rewrite(new URL("/salles/introuvable", request.url))`, qui sert au 404 d'une salle inconnue et de `/admin`. Next les envoie vers `http://localhost:<port>`, et elles échouent : pas de réponse, ou une 500 derrière les en-têtes de Caddy. Sans `-H`, ou avec `-H localhost`, le 404 est correct et le contrôle de fumée passe entièrement.

On retient `-H localhost`, qui n'écoute que sur la boucle locale, et Caddy pointe vers `localhost:3000`. À la recette, `ss -ltnp | grep 3000` doit montrer une écoute sur la boucle locale seulement.

---

## 3. Création du serveur (à faire ensemble)

1. **Projet Hetzner Cloud** dédié, accès limité aux personnes qui administrent.
2. **Clé SSH** : chaque administrateur dépose sa clé publique. Pas de mot de passe root par e-mail.
3. **Serveur** : type, emplacement et image Ubuntu LTS sont à trancher (D3, D4). Prévoir assez de mémoire pour `next build` sur le serveur ; 4 Go sont confortables, et un swap couvre un modèle plus petit. Rester sur une architecture **x86** si possible : `better-sqlite3` est un module natif, donc on le compile ou on le télécharge là où il tourne. Le Mac de développement est en ARM : ne jamais y construire pour copier.
4. **Réseau** : IPv4 et IPv6. L'IPv4 est facturée à part, mais GitHub n'est pas joignable en IPv6 seul, et une partie des clients non plus.
5. **Pare-feu Hetzner** (avant le premier démarrage) : entrée `22/tcp` (depuis les IP des administrateurs si possible, voir D5), `80/tcp` et `443/tcp` depuis partout. Rien d'autre, et surtout pas `3000`.
6. **Sauvegardes Hetzner** : option payante qui copie tout le disque chaque jour. **Non retenue** (D7) : la base est sauvegardée par nos scripts (section 6).
7. **DNS** : enregistrements `A` et `AAAA` du sous-domaine vers le serveur, **avant** de démarrer Caddy, qui obtient le certificat tout seul. Un `CAA` limité à Let's Encrypt est facultatif.
8. **Facturation à l'heure** : un serveur éteint est **toujours facturé** ; seule sa suppression arrête le compteur. Les instantanés et les sauvegardes ont leur propre coût.

---

## 4. Sécurisation du serveur

Ordre à suivre, au premier login :

1. **Mises à jour** : `apt update && apt full-upgrade`, puis `unattended-upgrades` pour les correctifs de sécurité. Le redémarrage automatique et son créneau sont à trancher (D6).
2. **Compte d'administration** nominatif avec `sudo`, connexion par clé uniquement. Dans `sshd_config` : `PermitRootLogin no`, `PasswordAuthentication no`, `KbdInteractiveAuthentication no`. Vérifier la nouvelle connexion **dans une seconde session** avant de fermer la première.
3. **Pare-feu local** `ufw` en plus du pare-feu Hetzner : `deny incoming`, `allow 22,80,443/tcp`. `fail2ban` sur `sshd`.
4. **Utilisateur de service** `reunea`, sans shell de connexion, propriétaire de `/srv/reunea` (versions) et de `/var/lib/reunea` (base, droits `700`). L'application ne tourne **jamais** en root.
5. **Secrets** : `/etc/reunea/reunea.env` en `root:reunea 640`, écrit à la main sur le serveur, jamais commité, jamais collé dans un ticket, une PR ou une conversation.
6. **Horloge** : `timedatectl` doit indiquer « System clock synchronized: yes » (TOTP et R6).
7. **Node.js** : la version majeure de `.nvmrc` (24), installée par un dépôt APT signé et figée sur cette version majeure (D12). Plus `sqlite3` (CLI de sauvegarde), `git`, `caddy` (dépôt officiel) et les outils de compilation au cas où `better-sqlite3` n'aurait pas de binaire précompilé.
8. **Service systemd** durci. Ébauche d'origine ; la version à jour est `deploiement/reunea.service`, avec `-H localhost` (voir 2.12) :

   ```ini
   [Unit]
   Description=Réunéa (Next.js)
   After=network-online.target
   Wants=network-online.target

   [Service]
   User=reunea
   Group=reunea
   WorkingDirectory=/srv/reunea/current
   # Hôte localhost (pas 127.0.0.1, voir 2.12) : par défaut next start écoute sur 0.0.0.0 (doc CLI).
   # PORT ne peut pas venir de .env (doc CLI) : passé ici.
   ExecStart=/usr/bin/node node_modules/next/dist/bin/next start -H localhost -p 3000
   Restart=on-failure
   # Arrêt propre : Next termine les requêtes en cours (doc self-hosting, 10 à 30 s).
   KillSignal=SIGTERM
   TimeoutStopSec=30
   NoNewPrivileges=true
   ProtectSystem=strict
   ProtectHome=true
   PrivateTmp=true
   ReadWritePaths=/var/lib/reunea /srv/reunea/releases

   [Install]
   WantedBy=multi-user.target
   ```

9. **Caddy**. Ébauche d'origine ; la version à jour est `deploiement/Caddyfile`, avec le domaine dans `REUNEA_DOMAINE` et `reverse_proxy localhost:3000` :

   ```caddyfile
   reservations.exemple.fr {
   	reverse_proxy localhost:3000
   	header {
   		Strict-Transport-Security "max-age=31536000"
   		X-Content-Type-Options "nosniff"
   		Referrer-Policy "strict-origin-when-cross-origin"
   		X-Frame-Options "DENY"
   		-Server
   	}
   	log {
   		output file /var/log/caddy/reunea.log {
   			roll_keep_for 720h
   		}
   	}
   }
   ```

   Points à **vérifier en recette** sur la version de Caddy installée, pas de mémoire :
   - Caddy remplace bien un `X-Forwarded-For` envoyé par le client, puisqu'aucun `trusted_proxies` n'est réglé ;
   - il transmet l'hôte public, ce qui évite `allowedOrigins` ;
   - les réponses en flux arrivent par morceaux (`curl -N` sur une fiche de salle). Sinon, `flush_interval -1`. Ne pas ajouter `encode` sans revérifier le flux.

   Une Content-Security-Policy est un chantier à part (`01-app/02-guides/content-security-policy.md`) : hors de ce plan.

10. **Journaux** : journald pour l'application, fichier Caddy gardé 30 jours. Les deux contiennent des adresses IP : leur conservation est à indiquer dans la politique de confidentialité.

---

## 5. Déploiement

### 5.1 Organisation sur le serveur

```
/srv/reunea/
  repo/                 clone git (clé de déploiement GitHub en lecture seule)
  releases/<sha>/       une version construite par dossier
  current -> releases/<sha>
/etc/reunea/reunea.env  secrets (lié en .env dans chaque version)
/var/lib/reunea/reunea.db
/var/backups/reunea/    sauvegardes locales
```

**Build sur le serveur**, avec `npm ci` puis `next build`, plutôt qu'en `output: "standalone"` ou en Docker :
- on reste au plus près de la doc (« Node.js server : All features ») ;
- `better-sqlite3` est compilé pour la bonne architecture ;
- Prisma CLI, `tsx` (seed, `admin:creer`, `deuxieme-facteur:reinitialiser`) et `prisma migrate deploy` restent disponibles sur place.

Le coût : quelques minutes de CPU et de mémoire à chaque livraison, **pendant que l'ancienne version continue de servir**.

`npm ci` lance `prisma generate`, qui lit `DATABASE_URL` par `prisma.config.ts`. `src/lib/prisma.ts` exige aussi cette variable au chargement. Le lien `.env` doit donc exister **avant** `npm ci` et `next build`.

### 5.2 Variables de production (`/etc/reunea/reunea.env`)

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | `file:/var/lib/reunea/reunea.db` (chemin absolu, accepté par l'adaptateur : à vérifier en recette) |
| `BETTER_AUTH_SECRET` | nouveau, `openssl rand -base64 32`, **différent** du développement |
| `BETTER_AUTH_URL` | `https://reservations.exemple.fr` |
| `SMTP_HOST`, `SMTP_PORT` | relevés dans Brevo (port 587, STARTTLS) |
| `SMTP_UTILISATEUR`, `SMTP_MOT_DE_PASSE` | identifiant et clé SMTP Brevo (pas la clé API) |
| `COURRIEL_EXPEDITEUR` | `Réunéa <ne-pas-repondre@domaine-entreprise>`, sur un domaine authentifié dans Brevo |
| `STRIPE_SECRET_KEY` | `sk_test_…`, ou une clé restreinte `rk_test_…` limitée à Checkout Sessions et Refunds (meilleure option, voir D1) |
| `NEXT_DEPLOYMENT_ID` | posé par `deployer.sh` au build (SHA), pas dans le fichier |

Plus aucune valeur d'exemple ne doit rester (`reunea.test`, `localhost`).

### 5.3 Premier déploiement

1. Serveur créé et sécurisé (sections 3 et 4), DNS en place.
2. Clé de déploiement GitHub **en lecture seule** pour `/srv/reunea/repo`, ou dépôt public (D14).
3. Écrire `/etc/reunea/reunea.env`.
4. `deployer.sh <étiquette> <branche>` (étapes en 7.1), qui crée la base avec `prisma migrate deploy` sur un fichier vide.
5. Seed de production, **sans** démonstration (2.1).
6. `npm run admin:creer -- <adresse>` sur le serveur, puis connexion par code (premier vrai e-mail Brevo) et enrôlement TOTP. Les codes de secours sont rangés dans le gestionnaire de mots de passe de l'entreprise.
7. **Recette manuelle avant d'annoncer l'adresse** :
   - connexion par code (e-mail reçu, pas dans les indésirables) ;
   - réservation, puis paiement avec la carte `4242 4242 4242 4242`, puis confirmation ;
   - R3 : un autre compte tente le même créneau et doit être refusé ;
   - R6 : une réservation non payée pendant 15 minutes est annulée à la consultation ;
   - 404 sur une salle inconnue et sur `/admin` vu par un client ;
   - `/admin/journal` affiche les vraies IP des clients, et non `127.0.0.1` ;
   - limite de débit déclenchée par une rafale de demandes de code ;
   - cookies `Secure` ;
   - `curl http://localhost:3000/api/sante` fonctionne depuis le serveur, `ss -ltnp` montre une écoute sur la boucle locale seulement, et le port 3000 ne répond pas depuis l'extérieur ;
   - une sauvegarde **et sa restauration** (section 6) ont été faites au moins une fois.
8. Activer le timer de sauvegarde et la surveillance externe.

---

## 6. Sauvegarde et restauration de la base

### 6.1 Ce qu'on sauvegarde
- `reunea.db` : salles, réservations, comptes, sessions, journal, secrets TOTP **chiffrés avec `BETTER_AUTH_SECRET`**.
- `/etc/reunea/reunea.env` : **pas** avec la base. Il est conservé à part, dans le gestionnaire de mots de passe de l'entreprise (voir 6.5).
- Le code est sur GitHub ; les photos sont dans `public/`, versionnées.

### 6.2 Comment
On ne copie jamais le fichier avec `cp` pendant que le service tourne, car on obtiendrait une copie incohérente au milieu d'une écriture. On utilise l'API de sauvegarde de SQLite, sûre à chaud :

```bash
sqlite3 /var/lib/reunea/reunea.db ".backup '/var/backups/reunea/reunea-<date UTC>.db'"
sqlite3 /var/backups/reunea/reunea-<date UTC>.db "PRAGMA integrity_check;"   # doit répondre ok
```

Puis compression, et copie **sur le poste de l'administrateur** (décision D7) avec `scripts/production/recuperer-sauvegarde.sh`, par `scp`, donc chiffrée en transit. Pas de chiffrement au repos : le serveur est temporaire. La copie locale, dans `sauvegardes/` (ignoré par git), contient des données personnelles : elle ne se partage pas et se supprime avec le serveur.

`scripts/production/sauvegarder-base.sh` est lancé par un timer systemd (`deploiement/reunea-sauvegarde.timer`) et par `deployer.sh` avant chaque migration. Un échec apparaît dans `systemctl --failed` ; il n'y a pas d'alerte externe (D11).

### 6.3 Fréquence et conservation (décision D7)
- Sur le serveur : toutes les heures, 48 heures gardées.
- Sur le poste : à la demande, en particulier avant la démonstration et avant la suppression du serveur.
- Avant chaque livraison : une sauvegarde nommée `avant-<étiquette>` ; les 5 dernières sont gardées.

La conservation ne doit pas dépasser ce qu'annonce la politique de confidentialité. Un compte supprimé (RGPD) survit dans les sauvegardes jusqu'à leur expiration ; il faut l'écrire.

### 6.4 Restauration (`scripts/production/restaurer-base.sh <fichier>`)
1. `systemctl stop reunea`, pour que plus personne n'écrive. Le script refuse tant que le service tourne.
2. Mettre de côté la base actuelle (`reunea-avant-restauration-<date>.db`) ; on ne l'écrase jamais.
3. Déchiffrer, décompresser, `PRAGMA integrity_check`.
4. Copier vers `/var/lib/reunea/reunea.db`, `chown reunea:reunea`, `chmod 600`.
5. `prisma migrate status` : le schéma doit correspondre à la version en service. Sinon, revenir à la version du code qui va avec (voir 8).
6. `systemctl start reunea`, puis `fumee.sh`.
7. **Paiements Stripe faits entre la sauvegarde et l'incident** : ces réservations n'existent plus en base, et l'application ne les retrouvera pas seule. Il faut les relever dans le tableau de bord Stripe (`client_reference_id` = id de la réservation) et traiter chaque cas à la main.

**Exercice de restauration** : à faire au moins une fois avant la démonstration, sur le serveur lui-même pendant la recette (avant l'annonce de l'adresse), avec `restaurer-base.sh`. Le serveur étant temporaire, pas d'exercice mensuel. Une sauvegarde qu'on n'a jamais restaurée ne compte pas.

### 6.5 Le cas de `BETTER_AUTH_SECRET`
Si on le perd, la base restaurée reste lisible, mais les secrets TOTP et les codes de secours du personnel deviennent indéchiffrables. Il faut alors réenrôler chacun avec `npm run deuxieme-facteur:reinitialiser -- <e-mail>`. Si on le change, toutes les sessions tombent. Il se conserve donc comme une clé de coffre, hors du serveur.

---

## 7. Livraison d'une nouvelle version

### 7.1 Chemin normal
1. **Contrainte du dépôt de formation** : `main` reste le point de départ vierge des apprenants et ne reçoit jamais de fusion. On livre depuis la branche du module (ici `module-12B`), poussée sur GitHub. Jamais de push sur `main`.
2. Étiquette **annotée** (`git tag -a`, convention D15) sur le commit à livrer de cette branche, poussée sur GitHub.
3. Sur le serveur, `scripts/production/deployer.sh <étiquette> <branche>` (branche `main` ou `module-<n>`, toujours explicite) :
   1. Vérifications sur GitHub, qui fait foi plutôt que le clone du serveur : l'étiquette existe (`git ls-remote`), elle est annotée, et son commit est sur la branche **telle qu'elle est sur GitHub**. Puis extraction dans `releases/<sha>/`.
   - Ce qu'on accepte : sans fusion dans `main`, la protection de `main` (PR, approbation, CI ; SECURITE.md, section 16) ne couvre pas ce qui est livré. Ce qui la remplace : l'étiquette annotée et poussée (qui, quand, pourquoi), la CI de la PR de la branche si elle existe, et le contrôle de fumée.
   2. Lien `.env` vers `/etc/reunea/reunea.env`.
   3. `npm ci` et `NEXT_DEPLOYMENT_ID=<sha> npm run build`. L'ancienne version sert toujours ; si le build échoue, on s'arrête là sans rien avoir touché.
   4. Sauvegarde de la base nommée avec le SHA (6.2).
   5. `npx prisma migrate deploy`.
   6. `current` pointe vers la nouvelle version, puis `systemctl restart reunea` : quelques secondes de coupure, qui ne touchent pas les requêtes en cours (SIGTERM).
   7. `fumee.sh`. En cas d'échec, **retour arrière automatique** vers la version précédente (8.1).
   8. On garde les 5 dernières versions et on efface les plus anciennes.
4. L'heure, le SHA et la personne sont notés dans un journal de livraison (`/srv/reunea/livraisons.log`).

Automatiser plus tard par GitHub Actions (SSH depuis la CI) reste possible, mais demande de stocker une clé SSH dans GitHub. Pour l'ouverture, on lance **à la main** (D16).

### 7.2 Règle pour les migrations : d'abord étendre, ensuite resserrer
Prisma n'a pas de migration descendante. Pour que l'ancienne version tourne encore sur le nouveau schéma, ce qui rend possible le retour arrière simple :
- une livraison n'**ajoute** que des tables, des colonnes facultatives ou avec valeur par défaut, et des index ;
- on supprime ou renomme une colonne seulement dans une livraison **ultérieure**, quand plus aucune version gardée ne s'en sert.

Le relecteur vérifie ce point dans la PR. Le hook `proteger-migrations.sh` empêche déjà de modifier une migration existante.

### 7.3 Contrôle de fumée (`scripts/production/fumee.sh`, lecture seule)
Contrôles faits, en plus de ceux de la liste ci-dessous : `/api/sante` répond `{"ok":true}`, `/salles` contient « Horizon », `/demonstration` répond 200.
- `GET /api/sante` doit répondre 200.
- `GET /` et `GET /salles` doivent répondre 200 et contenir le nom d'une salle.
- `GET /salles/inexistante` doit répondre 404.
- `GET /compte` sans cookie doit répondre 307 vers `/connexion`.
- `GET /admin` sans cookie doit aussi répondre 307 vers `/connexion`.
- `GET /` ne doit pas porter d'en-tête `X-Powered-By` (`poweredByHeader: false`).

Chaque version est contrôlée par **son propre** `fumee.sh` (`fumee_de`, `commun.sh`) : à la livraison, celui de la version livrée ; au retour arrière, celui de la version retrouvée, qui n'exige pas ce qu'une version plus récente a ajouté.

Aucune écriture, aucun compte créé, aucun e-mail envoyé.

---

## 8. Retour arrière

### 8.1 Code seul (cas courant, moins d'une minute)
`scripts/production/revenir.sh` fait pointer `current` vers la version précédente, puis `systemctl restart reunea` et `fumee.sh`. C'est possible parce que les migrations ne font qu'étendre le schéma (7.2) : l'ancienne version tourne sur le schéma récent. La base n'est **pas** touchée, et aucune réservation ni aucun paiement n'est perdu.

### 8.2 Code et base (exceptionnel)
On ne s'y résout que si une migration a abîmé des données, ou si la règle 7.2 n'a pas été respectée.
1. Arrêter le service.
2. Restaurer la sauvegarde prise juste avant la livraison (6.4).
3. Revenir à la version précédente du code (8.1).
4. Traiter à la main ce qui a été écrit entre-temps : réservations, comptes, paiements Stripe (6.4, point 7).

On compare d'abord avec une **correction vers l'avant** (nouvelle livraison qui répare), souvent moins coûteuse.

### 8.3 Serveur perdu
Recréer un VPS (sections 3 et 4), déployer la dernière étiquette, restaurer la dernière sauvegarde hors du serveur, réécrire `/etc/reunea/reunea.env` depuis le gestionnaire de mots de passe, mettre à jour le DNS. On mesure ce temps lors de l'exercice de restauration ; ce sera notre délai de reprise réel.

---

## 9. Décisions (prises le 12 novembre 2026)

| # | Sujet | Décision | Où c'est appliqué |
|---|---|---|---|
| D1 | Stripe en test sur un site public | Démonstration annoncée : bandeau clair et clé Stripe **restreinte** de test (`rk_test_`) | `BandeauDemonstration`, `/demonstration`, `deploiement/reunea.env.example` (permissions de la clé) |
| D2 | Sous-domaine | À venir ; l'adresse reste configurable | `BETTER_AUTH_URL` (application) et `REUNEA_DOMAINE` (Caddy) |
| D3 | Serveur | CX23, en Allemagne | `deploiement/LISEZMOI.md`, section 1 |
| D4 | Système | Ubuntu LTS la plus récente | idem |
| D5 | SSH | Depuis partout, par clé seulement, avec fail2ban | `LISEZMOI.md`, section 2 |
| D6 | Redémarrages | Oui, la nuit (03:00 UTC) | `LISEZMOI.md`, section 2 |
| D7 | Sauvegardes | Toutes les heures sur le serveur, plus une copie téléchargée sur le poste ; aucune option payante | `reunea-sauvegarde.timer`, `recuperer-sauvegarde.sh`, section 6 |
| D8 | Données de départ | Le seed actuel, sans la réservation de démonstration | `reservationDemoAutorisee` |
| D9 | Claude en production | Non, pas de clé Anthropic sur le serveur | `reunea.env.example` |
| D10 | Pages légales | Une page Démonstration suffit : ce n'est pas une ouverture commerciale | `src/app/demonstration/page.tsx` |
| D11 | Surveillance | Une route de santé, pas de service externe | `/api/sante`, `fumee.sh` |
| D12 | Node.js | Dépôt APT, version 24 figée | `LISEZMOI.md`, section 2 |
| D13 | Garde-fous Claude Code | `ask` | `.claude/settings.json` |
| D14 | Dépôt | Public, clone HTTPS en lecture | `LISEZMOI.md`, section 3 |
| D15 | Étiquettes | `v<année>.<mois>.<jour>-<n>`, **annotées**, poussées sur GitHub, sur la branche du module (`main` reste vierge) | `deployer.sh <étiquette> <branche>` refuse les autres |
| D16 | Livraison | Manuelle | `deployer.sh` |
| D17 | Préproduction | Non | |
| D18 | Mode WAL | Non | |
| D19 | Démonstration publique dans la durée | Remise à zéro chaque nuit à 2 h 30 (Paris) : toutes les réservations et les comptes clients effacés, après une sauvegarde ; jamais les salles, le personnel ni le journal des connexions. Pas de rattrapage au démarrage. Annoncé sur `/demonstration`. | `remettreAZeroDemo`, `reunea-remise-a-zero.timer`, `LISEZMOI.md`, section 5 |

Le serveur sera **supprimé après le tournage**. Avant de le supprimer, récupérer une dernière sauvegarde si besoin ; la copie locale contient des données personnelles et se supprime à son tour.
