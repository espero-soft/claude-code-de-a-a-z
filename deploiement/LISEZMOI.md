# Mise en production de Réunéa : installation du serveur

Pas à pas pour créer le serveur et livrer la première version. Le pourquoi de chaque choix est dans [design/PLAN-PRODUCTION.md](../design/PLAN-PRODUCTION.md).

Les commandes d'installation de Node.js et de Caddy changent avec le temps : les prendre **le jour même** sur leur page officielle (liens ci-dessous), pas de mémoire.

## Contenu du dossier

| Fichier | Où il va sur le serveur |
|---|---|
| `Caddyfile` | `/etc/caddy/Caddyfile` (domaine dans `REUNEA_DOMAINE`) |
| `reunea.service` | `/etc/systemd/system/` |
| `reunea-sauvegarde.service`, `reunea-sauvegarde.timer` | `/etc/systemd/system/` |
| `reunea-remise-a-zero.service`, `reunea-remise-a-zero.timer` | `/etc/systemd/system/` (démonstration remise à zéro chaque nuit) |
| `reunea.env.example` | modèle de `/etc/reunea/reunea.env`, rempli à la main |

Les scripts sont dans [`scripts/production/`](../scripts/production/), et leurs tests dans `production.test.ts`. Ils tournent sur le serveur, sauf `recuperer-sauvegarde.sh`, qui tourne sur le poste.

## 1. Créer le serveur (console Hetzner Cloud)

- **Type** CX23, emplacement en Allemagne, image **Ubuntu LTS la plus récente** proposée.
- **IPv4 et IPv6.**
- **Clé SSH** de chaque administrateur.
- **Aucune sauvegarde payante.**
- **Pare-feu Hetzner** : entrées `22/tcp`, `80/tcp` et `443/tcp` depuis partout, et rien d'autre.
- **DNS** : enregistrements `A` et `AAAA` du sous-domaine vers les adresses du serveur.
- **Facturation à l'heure** : un serveur éteint reste facturé. À la fin du tournage, **supprimer** le serveur, après avoir récupéré une dernière sauvegarde si besoin.

## 2. Sécuriser (connecté en root, une seule fois)

```bash
apt update && apt full-upgrade -y
adduser <admin> && usermod -aG sudo <admin>
mkdir -p /home/<admin>/.ssh && cp /root/.ssh/authorized_keys /home/<admin>/.ssh/
chown -R <admin>:<admin> /home/<admin>/.ssh && chmod 700 /home/<admin>/.ssh

# SSH par clé seulement, jamais en root.
cat >/etc/ssh/sshd_config.d/10-reunea.conf <<'FIN'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
FIN
sshd -t && systemctl reload ssh
```

**Avant de fermer la session root**, ouvrir une seconde session `ssh <admin>@<serveur>` et vérifier `sudo -v`. Ensuite, toujours en `<admin>` :

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable
sudo apt install -y fail2ban unattended-upgrades git sqlite3 curl build-essential python3
sudo systemctl enable --now fail2ban    # prison sshd active par défaut sous Ubuntu

# Correctifs de sécurité automatiques ; redémarrage la nuit si nécessaire
# (03:00 UTC, soit 4 h ou 5 h à Paris, hors des horaires du centre).
sudo tee /etc/apt/apt.conf.d/52reunea >/dev/null <<'FIN'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "03:00";
FIN

timedatectl    # « System clock synchronized: yes » : R6 et les codes TOTP en dépendent
```

- **Node.js 24**, par le dépôt APT de NodeSource, branche `24.x` (version majeure figée) : suivre https://github.com/nodesource/distributions. Vérifier avec `node -v`.
- **Caddy**, par son dépôt APT officiel : https://caddyserver.com/docs/install#debian-ubuntu-raspbian.

## 3. Préparer l'application

```bash
sudo adduser --system --group --home /srv/reunea --shell /usr/sbin/nologin reunea
sudo usermod -aG reunea <admin>          # lire les sauvegardes (se reconnecter ensuite)
sudo install -d -o reunea -g reunea -m 750 /srv/reunea /srv/reunea/releases /var/backups/reunea
sudo install -d -o reunea -g reunea -m 700 /var/lib/reunea
sudo install -d -o root -g reunea -m 750 /etc/reunea

# Dépôt public, clone HTTPS en lecture seule (décision D14).
# --branch : main est le point de départ vierge des apprenants, sans
# scripts/production/ ; le premier deployer.sh se lance depuis ce clone.
sudo -u reunea git clone --branch module-12B https://github.com/espero-soft/claude-code-de-a-a-z.git /srv/reunea/repo

# Secrets : partir du modèle, remplir à la main.
sudo install -o root -g reunea -m 640 /srv/reunea/repo/deploiement/reunea.env.example /etc/reunea/reunea.env
sudo nano /etc/reunea/reunea.env

# Services.
sudo cp /srv/reunea/repo/deploiement/reunea.service /srv/reunea/repo/deploiement/reunea-sauvegarde.* \
  /srv/reunea/repo/deploiement/reunea-remise-a-zero.* /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable reunea

# Caddy, avec le domaine.
sudo cp /srv/reunea/repo/deploiement/Caddyfile /etc/caddy/Caddyfile
sudo systemctl edit caddy     # ajouter : [Service] puis Environment=REUNEA_DOMAINE=<sous-domaine>
sudo systemctl restart caddy
```

## 4. Première livraison

Ce dépôt est celui d'une formation : **`main` reste le point de départ vierge des apprenants, on n'y fusionne jamais**. On livre donc depuis la branche du module (ici `module-12B`), ou depuis `main` s'il le faut ; la branche est toujours donnée à `deployer.sh`.

Sur le poste, on pose une étiquette **annotée** (`-a`, convention `v<année>.<mois>.<jour>-<n>`) sur le dernier commit de la branche, puis on pousse la branche et l'étiquette :

```bash
git switch module-12B
git push origin module-12B                      # la branche telle qu'elle sera vérifiée
git tag -a v2026.11.12-1 -m "Démonstration du module 12B"
git push origin v2026.11.12-1
```

`deployer.sh` refuse :
- une étiquette absente de GitHub (posée seulement en local, ou dans le clone du serveur) ;
- une étiquette légère (`git tag` sans `-a`) ;
- une étiquette dont le commit n'est pas sur la branche annoncée **telle qu'elle est sur GitHub**, donc pas poussée ;
- une branche autre que `main` ou `module-<n>`.

Sur le serveur :

```bash
sudo bash /srv/reunea/repo/scripts/production/deployer.sh v2026.11.12-1 module-12B
cd /srv/reunea/current
sudo -u reunea -H npm run db:seed                      # salles seulement : pas de réservation de démonstration en production
sudo -u reunea -H npm run admin:creer -- <e-mail>      # puis connexion par code et enrôlement TOTP
sudo systemctl enable --now reunea-sauvegarde.timer reunea-remise-a-zero.timer
bash scripts/production/fumee.sh https://<sous-domaine>
```

Faire ensuite la **recette** décrite dans `design/PLAN-PRODUCTION.md`, section 5.3, y compris une sauvegarde et sa restauration.

## 5. Au quotidien

| Besoin | Commande |
|---|---|
| Livrer une version | `sudo bash /srv/reunea/current/scripts/production/deployer.sh <étiquette> <branche>` (ex. `v2026.11.13-1 module-12B`) |
| Revenir à la version précédente (code seul) | `sudo bash /srv/reunea/current/scripts/production/revenir.sh` |
| Santé | `curl -s https://<sous-domaine>/api/sante` (doit répondre `{"ok":true}`) |
| Journaux | `journalctl -u reunea -f` ; sauvegardes : `journalctl -u reunea-sauvegarde` |
| Sauvegarde à la demande | `sudo -u reunea bash /srv/reunea/current/scripts/production/sauvegarder-base.sh manuelle` |
| Copie sur le poste | (sur le poste) `bash scripts/production/recuperer-sauvegarde.sh <admin>@<serveur>` |
| Restaurer | `sudo systemctl stop reunea`, puis `sudo bash …/restaurer-base.sh <fichier>` (le script donne la suite) |
| Historique des livraisons | `cat /srv/reunea/livraisons.log` |
| Remise à zéro de la démonstration | chaque nuit à 2 h 30 (Paris) ; prochaine : `systemctl list-timers reunea-remise-a-zero.timer` ; résultat : `journalctl -u reunea-remise-a-zero` ; à la demande : `sudo systemctl start reunea-remise-a-zero` |

### Installer la remise à zéro nocturne sur un serveur déjà en service

Une fois livrée une version qui contient `scripts/remettre-a-zero-demo.ts` (le service lance celle de `current`) :

```bash
sudo cp /srv/reunea/current/deploiement/reunea-remise-a-zero.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now reunea-remise-a-zero.timer
systemctl list-timers reunea-remise-a-zero.timer
```

Elle efface **toutes les réservations** et **les comptes clients** (sessions, codes, tickets de leur adresse), après une sauvegarde de la base (`ExecStartPre`, gardée 48 h). Elle ne touche jamais aux salles, aux comptes du personnel (employés, administrateurs) ni au journal des connexions. Un paiement Stripe de test laissé ouvert au moment de l'effacement n'a plus de réservation : rien n'est prélevé (mode test).

**Jamais** sur le serveur : `prisma migrate dev`, `npm run db:reset`, ni les tests Playwright. Ils écrivent dans la base et attendent Mailpit.
