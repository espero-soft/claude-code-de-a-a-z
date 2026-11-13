# Réglages et fonctions communs aux scripts de production (design/PLAN-PRODUCTION.md).
# Chargé par `source` ; ne s'exécute pas seul.
#
# Chemins du serveur, surchargeables par l'environnement (les tests de
# scripts/production/production.test.ts s'en servent pour tout faire dans un
# dossier temporaire, sans systemd ni root).

REUNEA_RACINE="${REUNEA_RACINE:-/srv/reunea}"                 # repo/, releases/, current
REUNEA_ENV="${REUNEA_ENV:-/etc/reunea/reunea.env}"             # secrets, lié en .env
REUNEA_BASE="${REUNEA_BASE:-/var/lib/reunea/reunea.db}"        # base SQLite
REUNEA_SAUVEGARDES="${REUNEA_SAUVEGARDES:-/var/backups/reunea}"
REUNEA_URL_LOCALE="${REUNEA_URL_LOCALE:-http://localhost:3000}" # Next, derrière Caddy (-H localhost)
REUNEA_SYSTEMCTL="${REUNEA_SYSTEMCTL:-systemctl}"
REUNEA_SERVICE="${REUNEA_SERVICE:-reunea}"
REUNEA_UTILISATEUR="${REUNEA_UTILISATEUR:-reunea}"
# Versions gardées dans releases/ (la version en service et la précédente
# ne sont jamais effacées).
REUNEA_VERSIONS_GARDEES="${REUNEA_VERSIONS_GARDEES:-5}"

RELEASES="$REUNEA_RACINE/releases"
COURANTE="$REUNEA_RACINE/current"
JOURNAL_LIVRAISONS="$REUNEA_RACINE/livraisons.log"

echouer() {
  echo "Erreur : $*" >&2
  exit 1
}

etape() {
  echo "==> $*"
}

# Lance une commande sous l'utilisateur du service quand on est root (jamais
# de build ni de migration en root), telle quelle sinon.
en_service() {
  if [ "$(id -u)" = "0" ]; then
    runuser -u "$REUNEA_UTILISATEUR" -- env HOME="$REUNEA_RACINE" "$@"
  else
    "$@"
  fi
}

service() {
  "$REUNEA_SYSTEMCTL" "$1" "$REUNEA_SERVICE"
}

# Fait pointer le lien `current` vers une version, d'un seul coup (mv d'un
# lien temporaire) : il n'existe aucun instant sans lien.
basculer_vers() {
  local cible="$1"
  ln -sfn "$cible" "$COURANTE.tmp"
  if mv --version >/dev/null 2>&1; then
    mv -Tf "$COURANTE.tmp" "$COURANTE"   # GNU (serveur Ubuntu)
  else
    mv -fh "$COURANTE.tmp" "$COURANTE"   # BSD (macOS, tests en local)
  fi
}

# Dossier de la version en service, vide s'il n'y en a pas encore.
version_courante() {
  if [ -L "$COURANTE" ]; then readlink "$COURANTE"; fi
}

# Contrôle de fumée d'une version : le sien, celui qu'elle a livré avec son
# code, car il décrit ce que CETTE version doit faire (une version plus
# récente peut vérifier un en-tête que l'ancienne envoie encore). À défaut,
# celui du script lancé. REUNEA_FUMEE l'emporte (tests).
fumee_de() {
  local version="$1"
  if [ -n "${REUNEA_FUMEE:-}" ]; then
    echo "$REUNEA_FUMEE"
  elif [ -f "$version/scripts/production/fumee.sh" ]; then
    echo "$version/scripts/production/fumee.sh"
  else
    echo "$DOSSIER_SCRIPTS/fumee.sh"
  fi
}

noter_livraison() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >>"$JOURNAL_LIVRAISONS"
}
