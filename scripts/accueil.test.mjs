// Tests des vérifications de scripts/accueil.mjs (commande /accueil).
// Point essentiel : aucune valeur de .env ne doit apparaître dans les résultats.
// npx vitest run scripts/accueil.test.mjs
import { describe, expect, test } from "vitest";
import {
  A_FAIRE,
  ATTENTION,
  OK,
  lireVariables,
  verifierBase,
  verifierDependances,
  verifierEnv,
  verifierMailpit,
  verifierNode,
  verifierShellStripe,
  verifierTests,
} from "./accueil.mjs";
import { cleAnthropicFactice, cleStripeFactice } from "../src/lib/cles-factices.ts";

const EXEMPLE = `# Copier ce fichier en .env
DATABASE_URL="file:./dev.db"
STRIPE_SECRET_KEY="sk_test_..."
BETTER_AUTH_SECRET=
BETTER_AUTH_URL="http://localhost:3000"
SMTP_HOST="localhost"
SMTP_PORT=1025
ANTHROPIC_API_KEY=
ADMIN_EMAIL=
`;

// Fausses clés assemblées à l'exécution (src/lib/cles-factices.ts) : même
// préfixe qu'une vraie, corps reconnaissable, rien qui ressemble à une clé dans le dépôt.
const CLE_STRIPE = cleStripeFactice("sk", "test", "FacticeNePasAfficher");
const SECRET_AUTH = "CeSecretFaitBienPlusDeTrenteDeuxCaracteres==";
const CLE_CLAUDE = cleAnthropicFactice("FacticeNePasAfficher");

const envComplet = (remplacements = {}) => {
  const valeurs = {
    DATABASE_URL: '"file:./dev.db"',
    STRIPE_SECRET_KEY: `"${CLE_STRIPE}"`,
    BETTER_AUTH_SECRET: SECRET_AUTH,
    BETTER_AUTH_URL: '"http://localhost:3000"',
    SMTP_HOST: "localhost",
    SMTP_PORT: "1025",
    ANTHROPIC_API_KEY: CLE_CLAUDE,
    ADMIN_EMAIL: "",
    ...remplacements,
  };
  return Object.entries(valeurs)
    .filter(([, valeur]) => valeur !== undefined)
    .map(([nom, valeur]) => `${nom}=${valeur}`)
    .join("\n");
};

const etatDe = (resultats, nom) => resultats.find((r) => r.nom === nom)?.etat;

describe("lireVariables", () => {
  test("lit guillemets, export, commentaires et valeurs vides", () => {
    const variables = lireVariables(
      `# commentaire\nexport A="un # deux"\nB='trois'\nC=quatre # note\nD=\n\nPAS_UNE_LIGNE`,
    );
    expect(Object.fromEntries(variables)).toEqual({ A: "un # deux", B: "trois", C: "quatre", D: "" });
  });
});

describe("verifierEnv", () => {
  test(".env absent : à faire, avec la commande de copie", () => {
    const [resultat] = verifierEnv(null, EXEMPLE);
    expect(resultat.etat).toBe(A_FAIRE);
    expect(resultat.action).toMatch(/cp \.env\.example \.env/);
  });

  test(".env complet : tout est OK", () => {
    const resultats = verifierEnv(envComplet(), EXEMPLE);
    expect(resultats.filter((r) => r.etat !== OK)).toEqual([]);
  });

  test("n'affiche jamais une valeur de .env, quel que soit le cas", () => {
    const cas = [
      envComplet(),
      envComplet({ STRIPE_SECRET_KEY: cleStripeFactice("sk", "live", "FacticeNePasAfficher") }),
      envComplet({ STRIPE_SECRET_KEY: cleStripeFactice("pk", "test", "FacticeNePasAfficher") }),
      envComplet({ BETTER_AUTH_SECRET: "CourtSecretNePasAfficher" }),
      envComplet({ DATABASE_URL: "postgres://utilisateur:MotDePasseNePasAfficher@hote/base" }),
    ];
    for (const texte of cas) {
      const sortie = JSON.stringify(verifierEnv(texte, EXEMPLE));
      expect(sortie).not.toMatch(/NePasAfficher|PlusDeTrente/);
    }
  });

  test("clé Stripe : vide, valeur d'exemple, live et mauvais format sont à faire", () => {
    for (const valeur of [
      "",
      '"sk_test_..."',
      cleStripeFactice("sk", "live"),
      cleStripeFactice("pk", "test"),
    ]) {
      const resultats = verifierEnv(envComplet({ STRIPE_SECRET_KEY: valeur }), EXEMPLE);
      expect(etatDe(resultats, ".env STRIPE_SECRET_KEY")).toBe(A_FAIRE);
    }
    const live = verifierEnv(envComplet({ STRIPE_SECRET_KEY: cleStripeFactice("sk", "live") }), EXEMPLE);
    expect(live.find((r) => r.nom === ".env STRIPE_SECRET_KEY").detail).toMatch(/LIVE/);
  });

  test("clé restreinte de test (rk_test_) acceptée, comme dans src/lib/stripe.ts", () => {
    const resultats = verifierEnv(envComplet({ STRIPE_SECRET_KEY: cleStripeFactice("rk", "test") }), EXEMPLE);
    expect(etatDe(resultats, ".env STRIPE_SECRET_KEY")).toBe(OK);
  });

  test("secret Better Auth : 31 caractères refusés, 32 acceptés", () => {
    const court = verifierEnv(envComplet({ BETTER_AUTH_SECRET: "a".repeat(31) }), EXEMPLE);
    expect(etatDe(court, ".env BETTER_AUTH_SECRET")).toBe(A_FAIRE);
    const juste = verifierEnv(envComplet({ BETTER_AUTH_SECRET: "a".repeat(32) }), EXEMPLE);
    expect(etatDe(juste, ".env BETTER_AUTH_SECRET")).toBe(OK);
  });

  test("ANTHROPIC_API_KEY vide : seulement à surveiller", () => {
    const resultats = verifierEnv(envComplet({ ANTHROPIC_API_KEY: "" }), EXEMPLE);
    expect(etatDe(resultats, ".env ANTHROPIC_API_KEY")).toBe(ATTENTION);
  });

  test("clé de .env.example absente de .env : signalée par son nom", () => {
    const resultats = verifierEnv(envComplet({ ADMIN_EMAIL: undefined }), EXEMPLE);
    const manque = resultats.find((r) => r.nom === ".env");
    expect(manque.etat).toBe(ATTENTION);
    expect(manque.detail).toMatch(/ADMIN_EMAIL/);
  });
});

describe("verifierShellStripe", () => {
  test("signale l'absence, n'affiche pas la valeur", () => {
    expect(verifierShellStripe({}).etat).toBe(ATTENTION);
    const present = verifierShellStripe({ STRIPE_SECRET_KEY: CLE_STRIPE });
    expect(present.etat).toBe(OK);
    expect(JSON.stringify(present)).not.toContain(CLE_STRIPE);
  });
});

describe("verifierNode", () => {
  test("version de .nvmrc : OK", () => {
    expect(verifierNode("v24.11.0", "24\n").etat).toBe(OK);
  });
  test("autre version récente : à surveiller, avec nvm use", () => {
    const resultat = verifierNode("v25.2.1", "24");
    expect(resultat.etat).toBe(ATTENTION);
    expect(resultat.action).toMatch(/nvm use/);
  });
  test("sous le minimum de package.json (20.9) : à faire", () => {
    expect(verifierNode("v20.8.1", "24").etat).toBe(A_FAIRE);
    expect(verifierNode("v18.20.0", "24").etat).toBe(A_FAIRE);
  });
});

describe("verifierDependances", () => {
  test("node_modules absent : npm ci, jamais npm install", () => {
    const [resultat] = verifierDependances({ nodeModules: false });
    expect(resultat.etat).toBe(A_FAIRE);
    expect(resultat.action).toMatch(/npm ci/);
    expect(resultat.action).not.toMatch(/npm install/);
  });
  test("lock plus récent que l'installation : npm ci", () => {
    const resultats = verifierDependances({ nodeModules: true, clientPrisma: true, verrouPlusRecent: true });
    const dependances = resultats.find((r) => r.nom === "Dépendances");
    expect(dependances.etat).toBe(ATTENTION);
    expect(dependances.action).toBe("npm ci");
  });
  test("client Prisma absent : prisma generate", () => {
    const resultats = verifierDependances({ nodeModules: true, clientPrisma: false, verrouPlusRecent: false });
    expect(etatDe(resultats, "Client Prisma")).toBe(A_FAIRE);
  });
});

describe("verifierBase", () => {
  const attendues = ["20261109000136_init", "20261110120000_paiement_stripe"];

  test("absente ou vide : migrate dev puis db:seed", () => {
    expect(verifierBase({ existe: false })[0].etat).toBe(A_FAIRE);
    expect(verifierBase({ existe: true, taille: 0 })[0].action).toMatch(/migrate dev.*db:seed/);
  });
  test("migration manquante nommée", () => {
    const resultats = verifierBase({
      existe: true,
      taille: 4096,
      migrationsAttendues: attendues,
      migrationsAppliquees: ["20261109000136_init"],
      sallesActives: 4,
    });
    expect(etatDe(resultats, "Migrations")).toBe(A_FAIRE);
    expect(resultats[0].detail).toMatch(/paiement_stripe/);
  });
  test("à jour mais sans salle : db:seed", () => {
    const resultats = verifierBase({
      existe: true,
      taille: 4096,
      migrationsAttendues: attendues,
      migrationsAppliquees: attendues,
      sallesActives: 0,
    });
    expect(etatDe(resultats, "Migrations")).toBe(OK);
    expect(resultats.find((r) => r.nom === "Données").action).toBe("npm run db:seed");
  });
});

describe("verifierMailpit et verifierTests", () => {
  test("SMTP fermé : à faire", () => {
    const [resultat] = verifierMailpit({ smtp: false, api: false, hote: "localhost", port: 1025, urlApi: "x" });
    expect(resultat.etat).toBe(A_FAIRE);
  });
  test("tests : sans dépendances, à faire ; en échec, à faire ; verts, OK", () => {
    expect(verifierTests({ lances: true, dependances: false }).etat).toBe(A_FAIRE);
    expect(verifierTests({ lances: true, dependances: true, statut: 1 }).etat).toBe(A_FAIRE);
    expect(verifierTests({ lances: true, dependances: true, statut: 0, resume: "Tests 3 passed (3)" }).etat).toBe(OK);
  });
});
