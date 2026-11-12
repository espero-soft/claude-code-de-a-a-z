#!/usr/bin/env node
// Vérifie l'installation d'un nouveau venu et dit, pour chaque point, quoi faire :
// version de Node, dépendances, .env et ses clés, base migrée et remplie,
// Mailpit, tests. Lancé par la commande /accueil de Claude Code, ou à la main :
//   npm run accueil              (ou node scripts/accueil.mjs)
//   npm run accueil -- --sans-tests
//
// Uniquement des modules intégrés à Node : le script doit marcher AVANT npm ci.
// Il conseille npm ci, jamais npm install : npm ci suit package-lock.json sans le réécrire.
// Il ne modifie rien. Secrets : .env est lu en mémoire pour contrôler la
// présence et la forme des clés ; aucune valeur n'est jamais affichée, seul un
// état (« renseignée », « valeur d'exemple », « clé live »...).
//
// Code de sortie : 0 si rien n'est « à faire », 1 sinon.
// Tests : npx vitest run scripts/accueil.test.mjs (inclus dans npm test)

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const OK = "OK";
export const A_FAIRE = "À FAIRE";
export const ATTENTION = "ATTENTION";

const RACINE = fileURLToPath(new URL("..", import.meta.url));
const NODE_MINIMUM = [20, 9]; // "engines" de package.json

const point = (nom, etat, detail, action = "") => ({ nom, etat, detail, action });
const renseignee = (valeur) => typeof valeur === "string" && valeur.trim() !== "";

// Lit un fichier au format .env : nom -> valeur (guillemets retirés).
// Les valeurs restent en mémoire : elles ne doivent jamais sortir de ce script.
export function lireVariables(texte) {
  const variables = new Map();
  for (const brute of texte.split(/\r?\n/)) {
    const ligne = brute.trim().replace(/^export\s+/, "");
    const egal = ligne.indexOf("=");
    if (ligne === "" || ligne.startsWith("#") || egal <= 0) continue;
    const nom = ligne.slice(0, egal).trim();
    let valeur = ligne.slice(egal + 1).trim();
    const guillemet = valeur[0];
    if (guillemet === '"' || guillemet === "'" || guillemet === "`") {
      const fin = valeur.indexOf(guillemet, 1);
      valeur = fin === -1 ? valeur.slice(1) : valeur.slice(1, fin);
    } else {
      valeur = valeur.replace(/\s+#.*$/, "");
    }
    variables.set(nom, valeur);
  }
  return variables;
}

export function verifierNode(version, nvmrc) {
  const [majeure, mineure] = version.replace(/^v/, "").split(".").map(Number);
  const attendue = Number(String(nvmrc ?? "").trim().replace(/^v/, "").split(".")[0]);
  if (majeure < NODE_MINIMUM[0] || (majeure === NODE_MINIMUM[0] && mineure < NODE_MINIMUM[1])) {
    return point("Node", A_FAIRE, `version ${version}, trop ancienne`, `installer Node ${attendue || 24} puis : nvm use`);
  }
  if (attendue && majeure !== attendue) {
    return point(
      "Node",
      ATTENTION,
      `version ${version}, le projet et la CI utilisent Node ${attendue} (.nvmrc)`,
      "nvm use (ou installer Node " + attendue + "), puis relancer npm ci",
    );
  }
  return point("Node", OK, `version ${version}`);
}

export function verifierDependances({ nodeModules, clientPrisma, verrouPlusRecent }) {
  if (!nodeModules) {
    return [point("Dépendances", A_FAIRE, "node_modules absent", "npm ci (génère aussi le client Prisma)")];
  }
  const resultats = [
    verrouPlusRecent
      ? point("Dépendances", ATTENTION, "package-lock.json a changé depuis la dernière installation", "npm ci")
      : point("Dépendances", OK, "installées"),
  ];
  resultats.push(
    clientPrisma
      ? point("Client Prisma", OK, "généré dans src/generated/prisma")
      : point("Client Prisma", A_FAIRE, "src/generated/prisma absent", "npx prisma generate"),
  );
  return resultats;
}

// Contrôle .env sans jamais recopier une valeur dans le résultat.
export function verifierEnv(texteEnv, texteExemple) {
  if (texteEnv === null) {
    return [point(".env", A_FAIRE, "absent", "cp .env.example .env, puis renseigner les clés (relancer /accueil ensuite)")];
  }
  const env = lireVariables(texteEnv);
  const exemple = lireVariables(texteExemple ?? "");
  const resultats = [];

  const db = env.get("DATABASE_URL");
  resultats.push(
    renseignee(db) && db.startsWith("file:")
      ? point(".env DATABASE_URL", OK, "renseignée")
      : point(".env DATABASE_URL", A_FAIRE, renseignee(db) ? "n'est pas une base SQLite (file:...)" : "absente ou vide", 'DATABASE_URL="file:./dev.db"'),
  );

  const stripe = env.get("STRIPE_SECRET_KEY");
  const actionStripe = "clé de TEST : tableau de bord Stripe > Développeurs > Clés API (sk_test_…), ou la demander à l'équipe";
  if (!renseignee(stripe)) {
    resultats.push(point(".env STRIPE_SECRET_KEY", A_FAIRE, "absente ou vide", actionStripe));
  } else if (stripe.includes("...") || stripe.includes("…") || stripe === exemple.get("STRIPE_SECRET_KEY")) {
    resultats.push(point(".env STRIPE_SECRET_KEY", A_FAIRE, "valeur d'exemple de .env.example", actionStripe));
  } else if (/^(sk|rk)_live_/.test(stripe)) {
    resultats.push(point(".env STRIPE_SECRET_KEY", A_FAIRE, "clé LIVE : refusée par l'application, ne jamais la mettre ici", actionStripe));
  } else if (!/^(sk|rk)_test_/.test(stripe)) {
    resultats.push(point(".env STRIPE_SECRET_KEY", A_FAIRE, "format inattendu (attendu sk_test_…)", actionStripe));
  } else {
    resultats.push(point(".env STRIPE_SECRET_KEY", OK, "clé de test renseignée"));
  }

  const secret = env.get("BETTER_AUTH_SECRET");
  resultats.push(
    renseignee(secret) && secret.length >= 32
      ? point(".env BETTER_AUTH_SECRET", OK, "renseigné (32 caractères au moins)")
      : point(".env BETTER_AUTH_SECRET", A_FAIRE, renseignee(secret) ? "moins de 32 caractères" : "absent ou vide", "en générer un : openssl rand -base64 32"),
  );

  for (const [nom, conseil] of [
    ["BETTER_AUTH_URL", 'BETTER_AUTH_URL="http://localhost:3000"'],
    ["SMTP_HOST", 'SMTP_HOST="localhost" (Mailpit)'],
    ["SMTP_PORT", "SMTP_PORT=1025 (Mailpit)"],
  ]) {
    resultats.push(
      renseignee(env.get(nom))
        ? point(`.env ${nom}`, OK, "renseignée")
        : point(`.env ${nom}`, A_FAIRE, "absente ou vide", conseil),
    );
  }

  resultats.push(
    renseignee(env.get("ANTHROPIC_API_KEY"))
      ? point(".env ANTHROPIC_API_KEY", OK, "renseignée")
      : point(".env ANTHROPIC_API_KEY", ATTENTION, "vide (facultative)", "seulement pour npm run premier-appel et les autres scripts de l'API Claude"),
  );

  const manquantes = [...exemple.keys()].filter((nom) => !env.has(nom));
  if (manquantes.length > 0) {
    resultats.push(point(".env", ATTENTION, `clés de .env.example absentes : ${manquantes.join(", ")}`, "les recopier depuis .env.example"));
  }
  return resultats;
}

// La clé Stripe du serveur MCP vient de l'environnement du shell, pas de .env.
export function verifierShellStripe(environnement) {
  return renseignee(environnement.STRIPE_SECRET_KEY)
    ? point("Shell STRIPE_SECRET_KEY", OK, "exportée (serveur MCP stripe)")
    : point(
        "Shell STRIPE_SECRET_KEY",
        ATTENTION,
        "non exportée : le serveur MCP stripe de .mcp.json ne la trouvera pas",
        "export STRIPE_SECRET_KEY=<clé de test> dans le shell, puis relancer claude",
      );
}

export function verifierBase({ existe, taille, migrationsAttendues, migrationsAppliquees, sallesActives, erreur }) {
  if (!existe || taille === 0) {
    return [point("Base dev.db", A_FAIRE, existe ? "fichier vide" : "absente", "npx prisma migrate dev, puis npm run db:seed")];
  }
  if (erreur) return [point("Base dev.db", ATTENTION, `lecture impossible (${erreur})`, "npx prisma migrate status")];
  if (migrationsAppliquees === null) {
    return [point("Base dev.db", A_FAIRE, "aucune migration appliquée", "npx prisma migrate dev, puis npm run db:seed")];
  }
  const manquantes = migrationsAttendues.filter((nom) => !migrationsAppliquees.includes(nom));
  const resultats = [
    manquantes.length === 0
      ? point("Migrations", OK, `${migrationsAttendues.length} appliquées`)
      : point(
          "Migrations",
          A_FAIRE,
          `${manquantes.length} non appliquée(s) : ${manquantes.slice(0, 3).join(", ")}${manquantes.length > 3 ? ", ..." : ""}`,
          "npx prisma migrate dev (puis redémarrer npm run dev)",
        ),
  ];
  if (sallesActives !== null) {
    resultats.push(
      sallesActives > 0
        ? point("Données", OK, `${sallesActives} salle(s) active(s)`)
        : point("Données", A_FAIRE, "aucune salle", "npm run db:seed"),
    );
  }
  return resultats;
}

export function verifierMailpit({ smtp, api, hote, port, urlApi }) {
  if (!smtp) {
    return [point("Mailpit", A_FAIRE, `SMTP ${hote}:${port} ne répond pas (codes de connexion non reçus)`, "lancer Mailpit : mailpit (ou brew services start mailpit)")];
  }
  return [
    api
      ? point("Mailpit", OK, `SMTP ${hote}:${port} et boîte ${urlApi}`)
      : point("Mailpit", ATTENTION, `SMTP ${hote}:${port} répond, mais pas ${urlApi}`, "vérifier l'interface web de Mailpit (les tests e2e y lisent les codes)"),
  ];
}

export function verifierTests({ lances, dependances, statut, resume }) {
  if (!dependances) return point("Tests", A_FAIRE, "non lancés : dépendances absentes", "npm ci, puis npm test");
  if (!lances) return point("Tests", ATTENTION, "non lancés (--sans-tests)", "npm test");
  return statut === 0
    ? point("Tests", OK, resume || "tous passent")
    : point("Tests", A_FAIRE, resume || "en échec", "npm test pour le détail (ou /verifier dans Claude)");
}

// --- Lecture de la machine (non testée unitairement) ---

function lireFichier(chemin) {
  try {
    return readFileSync(chemin, "utf8");
  } catch {
    return null;
  }
}

function etatDependances() {
  const nodeModules = existsSync(path.join(RACINE, "node_modules"));
  const verrouCache = path.join(RACINE, "node_modules", ".package-lock.json");
  const verrou = path.join(RACINE, "package-lock.json");
  return {
    nodeModules,
    clientPrisma: existsSync(path.join(RACINE, "src", "generated", "prisma")),
    verrouPlusRecent:
      nodeModules && existsSync(verrouCache) && existsSync(verrou)
        ? statSync(verrou).mtimeMs > statSync(verrouCache).mtimeMs
        : false,
  };
}

async function etatBase(urlBase) {
  const fichier = (renseignee(urlBase) && urlBase.startsWith("file:") ? urlBase.slice(5) : "./dev.db");
  const chemin = path.resolve(RACINE, fichier);
  const migrationsAttendues = readdirSync(path.join(RACINE, "prisma", "migrations"), { withFileTypes: true })
    .filter((entree) => entree.isDirectory())
    .map((entree) => entree.name)
    .sort();
  // Ne jamais ouvrir un fichier absent : SQLite le créerait.
  if (!existsSync(chemin)) return { existe: false };
  const taille = statSync(chemin).size;
  if (taille === 0) return { existe: true, taille };

  let DatabaseSync;
  const avertir = process.emitWarning;
  try {
    process.emitWarning = () => {}; // node:sqlite est « experimental » sous Node 24
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    return { existe: true, taille, erreur: "node:sqlite indisponible avec cette version de Node" };
  } finally {
    process.emitWarning = avertir;
  }

  let base;
  try {
    base = new DatabaseSync(chemin, { readOnly: true });
    let migrationsAppliquees = null;
    try {
      migrationsAppliquees = base
        .prepare("SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")
        .all()
        .map((ligne) => ligne.migration_name);
    } catch {
      return { existe: true, taille, migrationsAttendues, migrationsAppliquees: null };
    }
    let sallesActives = null;
    try {
      sallesActives = Number(base.prepare("SELECT COUNT(*) AS n FROM Salle WHERE active = 1").get().n);
    } catch {
      sallesActives = 0;
    }
    return { existe: true, taille, migrationsAttendues, migrationsAppliquees, sallesActives };
  } catch (e) {
    return { existe: true, taille, erreur: e.code ?? "erreur SQLite" };
  } finally {
    base?.close();
  }
}

function portOuvert(hote, port) {
  return new Promise((resoudre) => {
    const socket = net.connect({ host: hote, port, timeout: 1500 });
    const finir = (ouvert) => {
      socket.destroy();
      resoudre(ouvert);
    };
    socket.once("connect", () => finir(true));
    socket.once("timeout", () => finir(false));
    socket.once("error", () => finir(false));
  });
}

async function urlRepond(url) {
  try {
    const reponse = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return reponse.ok;
  } catch {
    return false;
  }
}

function lancerTests() {
  const resultat = spawnSync("npx", ["--no-install", "vitest", "run"], {
    cwd: RACINE,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  const sortie = `${resultat.stdout ?? ""}\n${resultat.stderr ?? ""}`;
  const ligne = sortie.split("\n").find((l) => /^\s*Tests\s+\d/.test(l));
  return { statut: resultat.status, resume: ligne ? ligne.trim().replace(/\s+/g, " ") : "" };
}

async function main() {
  const sansTests = process.argv.includes("--sans-tests");
  const texteEnv = lireFichier(path.join(RACINE, ".env"));
  const env = texteEnv === null ? new Map() : lireVariables(texteEnv);
  const dependances = etatDependances();

  const hote = env.get("SMTP_HOST") || "localhost";
  const port = Number(env.get("SMTP_PORT") || 1025);
  const urlApi = `${process.env.MAILPIT_URL ?? "http://localhost:8025"}/api/v1/info`;
  const [smtp, api] = await Promise.all([portOuvert(hote, port), urlRepond(urlApi)]);

  const resultats = [
    verifierNode(process.version, lireFichier(path.join(RACINE, ".nvmrc"))),
    ...verifierDependances(dependances),
    ...verifierEnv(texteEnv, lireFichier(path.join(RACINE, ".env.example"))),
    verifierShellStripe(process.env),
    ...verifierBase(await etatBase(env.get("DATABASE_URL"))),
    ...verifierMailpit({ smtp, api, hote, port, urlApi }),
  ];

  const tests = dependances.nodeModules && !sansTests ? lancerTests() : {};
  resultats.push(verifierTests({ lances: !sansTests, dependances: dependances.nodeModules, ...tests }));

  console.log("Accueil : vérification de l'installation\n");
  for (const { nom, etat, detail, action } of resultats) {
    console.log(`[${etat}] ${nom} : ${detail}`);
    if (action) console.log(`    -> ${action}`);
  }
  const aFaire = resultats.filter((r) => r.etat === A_FAIRE).length;
  const attention = resultats.filter((r) => r.etat === ATTENTION).length;
  console.log(`\n${aFaire} point(s) à faire, ${attention} à surveiller.`);
  return aFaire === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code));
}
