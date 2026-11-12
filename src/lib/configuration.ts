// Configuration de l'application lue dans l'environnement (design/PLAN-PRODUCTION.md).
// Fonctions pures : l'environnement est passé en argument (process.env dans
// l'application, un objet dans les tests). Aucun message ne contient jamais
// la VALEUR d'une variable : seulement son nom (les secrets n'apparaissent
// pas dans les journaux du serveur).

export type Environnement = Record<string, string | undefined>;

const HOTES_LOCAUX = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function estHoteLocal(hote: string): boolean {
  return HOTES_LOCAUX.has(hote.trim().toLowerCase());
}

function lireUrl(valeur: string | undefined): URL | null {
  if (!valeur?.trim()) return null;
  try {
    const url = new URL(valeur.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

// Adresse publique du site (BETTER_AUTH_URL), sans chemin ni barre finale :
// « https://reservations.exemple.fr ». Sert aussi d'adresse de retour après
// un paiement Stripe : jamais un en-tête de la requête.
export function adressePublique(env: Environnement): string {
  const url = lireUrl(env.BETTER_AUTH_URL);
  if (!url) {
    throw new Error("BETTER_AUTH_URL n'est pas une adresse http(s) valide (voir .env.example).");
  }
  return url.origin;
}

// Adresse publique en HTTPS, hors de la machine : c'est le serveur de production.
function adresseDeProduction(env: Environnement): boolean {
  const url = lireUrl(env.BETTER_AUTH_URL);
  return url !== null && url.protocol === "https:" && !estHoteLocal(url.hostname);
}

// La réservation CONFIRMÉE de démonstration du seed bloquerait un vrai créneau
// (R3) : jamais en production, même si `npm run db:seed` y est lancé sans
// NODE_ENV (tsx ne le fixe pas). Le fichier .env du serveur porte l'adresse
// publique en HTTPS : c'est elle qui fait foi.
export function reservationDemoAutorisee(env: Environnement): boolean {
  return env.NODE_ENV !== "production" && !adresseDeProduction(env);
}

// Chiffrement de la connexion SMTP :
// - « aucun » : Mailpit en local (ni TLS ni authentification) ;
// - « starttls » : port 587, la connexion DOIT passer en TLS (requireTLS),
//   sinon l'envoi échoue au lieu de partir en clair (Brevo) ;
// - « implicite » : TLS dès la connexion (port 465).
export const MODES_TLS = ["aucun", "starttls", "implicite"] as const;
export type ModeTls = (typeof MODES_TLS)[number];

function estModeTls(valeur: string): valeur is ModeTls {
  return (MODES_TLS as readonly string[]).includes(valeur);
}

// SMTP_TLS s'il est renseigné, sinon déduit : « aucun » pour un hôte local
// (Mailpit), « implicite » sur le port 465, « starttls » ailleurs.
export function modeTls(env: Environnement): ModeTls {
  const choisi = env.SMTP_TLS?.trim().toLowerCase();
  if (choisi) {
    if (!estModeTls(choisi)) {
      throw new Error(`SMTP_TLS doit valoir ${MODES_TLS.join(", ")}.`);
    }
    return choisi;
  }
  if (estHoteLocal(env.SMTP_HOST ?? "localhost")) return "aucun";
  return env.SMTP_PORT?.trim() === "465" ? "implicite" : "starttls";
}

export type OptionsSmtp = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  auth?: { user: string; pass: string };
};

// Options du transport nodemailer. Sans SMTP_HOST : Mailpit (localhost:1025).
export function optionsSmtp(env: Environnement): OptionsSmtp {
  const host = env.SMTP_HOST?.trim() || "localhost";
  const mode = modeTls({ ...env, SMTP_HOST: host });
  const portParDefaut = mode === "aucun" ? 1025 : mode === "implicite" ? 465 : 587;
  const port = env.SMTP_PORT?.trim() ? Number(env.SMTP_PORT) : portParDefaut;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("SMTP_PORT n'est pas un numéro de port valide.");
  }
  const utilisateur = env.SMTP_UTILISATEUR?.trim();
  return {
    host,
    port,
    secure: mode === "implicite",
    requireTLS: mode === "starttls",
    auth: utilisateur ? { user: utilisateur, pass: env.SMTP_MOT_DE_PASSE ?? "" } : undefined,
  };
}

// Problèmes de configuration qui empêchent la production de fonctionner (ou de
// fonctionner en sécurité). Liste vide : tout est en place. Appelée au
// démarrage du serveur par src/instrumentation.ts, qui refuse alors de démarrer.
export function verifierConfiguration(env: Environnement): string[] {
  const problemes: string[] = [];
  const manque = (nom: string) => !env[nom]?.trim();

  const base = env.DATABASE_URL?.trim();
  if (!base) problemes.push("DATABASE_URL manque.");
  else if (!base.startsWith("file:")) problemes.push("DATABASE_URL doit désigner un fichier SQLite (file:…).");

  if (manque("BETTER_AUTH_SECRET")) problemes.push("BETTER_AUTH_SECRET manque.");
  else if (env.BETTER_AUTH_SECRET!.trim().length < 32) {
    problemes.push("BETTER_AUTH_SECRET doit compter au moins 32 caractères.");
  }

  const url = lireUrl(env.BETTER_AUTH_URL);
  if (manque("BETTER_AUTH_URL")) problemes.push("BETTER_AUTH_URL manque.");
  else if (!url) problemes.push("BETTER_AUTH_URL n'est pas une adresse valide.");
  else if (!adresseDeProduction(env)) {
    problemes.push("BETTER_AUTH_URL doit être l'adresse publique en https:// (pas localhost).");
  }

  if (manque("SMTP_HOST")) problemes.push("SMTP_HOST manque (Mailpit n'existe pas en production).");
  else if (estHoteLocal(env.SMTP_HOST!)) problemes.push("SMTP_HOST désigne la machine locale (Mailpit).");
  if (manque("SMTP_UTILISATEUR")) problemes.push("SMTP_UTILISATEUR manque.");
  if (manque("SMTP_MOT_DE_PASSE")) problemes.push("SMTP_MOT_DE_PASSE manque.");
  try {
    // Hôte local : déjà signalé ci-dessus, inutile de le dire deux fois.
    if (!manque("SMTP_HOST") && !estHoteLocal(env.SMTP_HOST!) && modeTls(env) === "aucun") {
      problemes.push("SMTP_TLS ne peut pas valoir « aucun » : les e-mails partiraient en clair.");
    }
    optionsSmtp(env);
  } catch (erreur) {
    problemes.push((erreur as Error).message);
  }

  const expediteur = env.COURRIEL_EXPEDITEUR?.trim();
  if (!expediteur) problemes.push("COURRIEL_EXPEDITEUR manque.");
  else if (/\.(test|example|invalid|localhost)>?$/i.test(expediteur)) {
    problemes.push("COURRIEL_EXPEDITEUR garde l'adresse d'exemple : mettre une adresse du domaine authentifié dans Brevo.");
  }

  const stripe = env.STRIPE_SECRET_KEY?.trim();
  if (!stripe) problemes.push("STRIPE_SECRET_KEY manque.");
  else if (!stripe.startsWith("sk_test_") && !stripe.startsWith("rk_test_")) {
    problemes.push("STRIPE_SECRET_KEY doit être une clé de test (rk_test_… restreinte, ou sk_test_…).");
  }

  return problemes;
}
