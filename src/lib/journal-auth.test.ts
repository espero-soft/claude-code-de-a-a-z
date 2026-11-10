// Journal des connexions branché sur le VRAI Better Auth (src/lib/auth.ts,
// ses routes et nos crochets), sur une vraie base SQLite temporaire : chaque
// événement de connexion est journalisé, et ni le code reçu par e-mail ni le
// code TOTP, ni le jeton de session, ni le secret n'apparaissent en base
// dans le journal. Seul l'envoi d'e-mail est simulé, pour lire le code.
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { codeTotp } from "../../e2e/totp";

const { dossier, codes } = vi.hoisted(() => {
  // Avant tout import de @/lib/prisma, qui lit DATABASE_URL au chargement.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const path = require("node:path") as typeof import("node:path");
  /* eslint-enable @typescript-eslint/no-require-imports */
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "journal-auth-"));
  process.env.DATABASE_URL = `file:${path.join(dossier, "test.db")}`;
  process.env.BETTER_AUTH_SECRET = "secret-de-test-uniquement-pour-vitest-0123456789";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  return { dossier, codes: new Map<string, string>() };
});

// Le code de connexion figure dans le sujet de l'e-mail.
vi.mock("@/lib/courriel", () => ({
  envoyerCourriel: vi.fn(async ({ a, sujet }: { a: string; sujet: string }) => {
    codes.set(a, sujet.match(/(\d{6})$/)![1]);
  }),
}));

type Auth = typeof import("@/lib/auth").auth;
type Prisma = typeof import("@/lib/prisma").prisma;
let auth: Auth;
let prisma: Prisma;

beforeAll(async () => {
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: process.env, stdio: "ignore" });
  ({ auth } = await import("@/lib/auth"));
  ({ prisma } = await import("@/lib/prisma"));
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(dossier, { recursive: true, force: true });
});

// Requête « venue » d'un navigateur : adresse IP et User-Agent.
const NAVIGATEUR = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Firefox/140.0";
function entetes(ip: string, cookie?: string) {
  const h = new Headers({ "x-forwarded-for": ip, "user-agent": NAVIGATEUR });
  if (cookie) h.set("cookie", cookie);
  return h;
}

// « nom=valeur; ... » à partir des Set-Cookie d'une réponse.
function cookieDe(reponse: Headers): string {
  return reponse
    .getSetCookie()
    .map((ligne) => ligne.split(";")[0])
    .filter((paire) => !paire.endsWith("="))
    .join("; ");
}

async function demanderCode(email: string, ip = "203.0.113.10") {
  await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" }, headers: entetes(ip) });
  return codes.get(email)!;
}

async function connecter(email: string, ip = "203.0.113.10") {
  const otp = await demanderCode(email, ip);
  const { headers } = await auth.api.signInEmailOTP({
    body: { email, otp },
    headers: entetes(ip),
    returnHeaders: true,
  });
  return { otp, cookie: cookieDe(headers) };
}

async function journalDe(email: string) {
  return prisma.evenementConnexion.findMany({
    where: { email },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

const faux = (otp: string) => (otp === "000000" ? "111111" : "000000");

// Aucune ligne du journal, toutes colonnes, ne contient ces valeurs.
async function journalSans(valeurs: string[]) {
  const texte = JSON.stringify(await prisma.evenementConnexion.findMany());
  for (const valeur of valeurs) expect(texte).not.toContain(valeur);
}

describe("connexion par code e-mail", () => {
  const email = "paul@journal.example.com";

  it("journalise code demandé, code refusé, connexion réussie et déconnexion", async () => {
    const otp = await demanderCode(email);
    await expect(
      auth.api.signInEmailOTP({ body: { email, otp: faux(otp) }, headers: entetes("203.0.113.10") }),
    ).rejects.toThrow();
    const { headers } = await auth.api.signInEmailOTP({
      body: { email: "Paul@Journal.Example.com", otp },
      headers: entetes("203.0.113.10"),
      returnHeaders: true,
    });
    const cookie = cookieDe(headers);
    await auth.api.signOut({ headers: entetes("203.0.113.10", cookie) });

    const compte = await prisma.user.findFirstOrThrow({ where: { email } });
    const lignes = await journalDe(email);
    expect(lignes.map((ligne) => [ligne.type, ligne.motif])).toEqual([
      ["CODE_DEMANDE", null],
      ["CODE_REFUSE", "code-incorrect"],
      ["CONNEXION_REUSSIE", null],
      ["DECONNEXION", null],
    ]);
    for (const ligne of lignes) {
      expect(ligne.ip).toBe("203.0.113.10");
      expect(ligne.navigateur).toBe(NAVIGATEUR);
    }
    expect(lignes[2].utilisateurId).toBe(compte.id);

    // Ni le code, ni le faux, ni le jeton de session.
    const jeton = cookie.split("=")[1].split(".")[0];
    expect(jeton.length).toBeGreaterThan(10);
    await journalSans([otp, faux(otp), jeton, decodeURIComponent(jeton)]);
  });

  it("journalise le code épuisé après 3 essais", async () => {
    const victime = "epuise@journal.example.com";
    const otp = await demanderCode(victime);
    for (let i = 0; i < 4; i++) {
      await auth.api
        .signInEmailOTP({ body: { email: victime, otp: faux(otp) }, headers: entetes("198.51.100.1") })
        .catch(() => {});
    }
    const motifs = (await journalDe(victime)).map((ligne) => ligne.motif);
    expect(motifs).toContain("code-incorrect");
    expect(motifs).toContain("code-epuise");
  });

  it("journalise le blocage après trop de codes demandés", async () => {
    const victime = "envois@journal.example.com";
    for (let i = 0; i < 3; i++) await demanderCode(victime, "198.51.100.2");
    await expect(
      auth.api.sendVerificationOTP({
        body: { email: victime, type: "sign-in" },
        headers: entetes("198.51.100.2"),
      }),
    ).rejects.toThrow();

    const lignes = await journalDe(victime);
    expect(lignes.map((ligne) => ligne.type)).toEqual([
      "CODE_DEMANDE",
      "CODE_DEMANDE",
      "CODE_DEMANDE",
      "COMPTE_BLOQUE",
    ]);
    expect(lignes[3]).toMatchObject({ motif: "trop-de-codes-demandes", ip: "198.51.100.2" });
  });

  it("journalise le blocage après trop d'essais de code", async () => {
    const victime = "essais@journal.example.com";
    const otp = await demanderCode(victime);
    for (let i = 0; i < 11; i++) {
      await auth.api
        .signInEmailOTP({ body: { email: victime, otp: faux(otp) }, headers: entetes("198.51.100.3") })
        .catch(() => {});
    }
    const lignes = await journalDe(victime);
    expect(lignes.filter((ligne) => ligne.type === "CODE_REFUSE")).toHaveLength(10);
    expect(lignes.at(-1)).toMatchObject({ type: "COMPTE_BLOQUE", motif: "trop-d-essais-de-code" });
    await journalSans([otp]);
  });
});

describe("second facteur du personnel", () => {
  it("journalise second facteur refusé, validé, rejoué, puis le blocage", async () => {
    const email = "employe@journal.example.com";
    const premier = await connecter(email, "192.0.2.5");
    await prisma.user.update({ where: { email }, data: { role: "EMPLOYE" } });
    const compte = await prisma.user.findFirstOrThrow({ where: { email } });

    const enrolement = await auth.api.enableTwoFactor({
      body: { method: "totp" },
      headers: entetes("192.0.2.5", premier.cookie),
    });
    if (enrolement.method !== "totp") throw new Error("enrôlement TOTP attendu");
    const { totpURI, backupCodes } = enrolement;
    const cle = new URL(totpURI).searchParams.get("secret")!;

    // Faux code, puis le bon (fin de l'enrôlement : nouvelle session).
    await expect(
      auth.api.verifyTOTP({ body: { code: "000000" }, headers: entetes("192.0.2.5", premier.cookie) }),
    ).rejects.toThrow();
    const code = codeTotp(cle);
    const { headers } = await auth.api.verifyTOTP({
      body: { code },
      headers: entetes("192.0.2.5", premier.cookie),
      returnHeaders: true,
    });
    const cookie = cookieDe(headers) || premier.cookie;

    // Le bon code a remis le compteur à zéro. Rejeu du même code, puis
    // quatre faux : 5 essais, le 6e est bloqué avant même d'être vérifié.
    for (const essai of [code, "000000", "000001", "000002", "000003", "000004"]) {
      await auth.api
        .verifyTOTP({ body: { code: essai }, headers: entetes("192.0.2.5", cookie) })
        .catch(() => {});
    }

    const lignes = (await journalDe(email)).filter((ligne) => ligne.type !== "CODE_DEMANDE");
    expect(lignes.map((ligne) => [ligne.type, ligne.motif])).toEqual([
      ["CONNEXION_REUSSIE", null],
      ["DEUXIEME_FACTEUR_REFUSE", "application"],
      ["DEUXIEME_FACTEUR_VALIDE", "application"],
      ["DEUXIEME_FACTEUR_REFUSE", "code-deja-utilise"],
      ["DEUXIEME_FACTEUR_REFUSE", "application"],
      ["DEUXIEME_FACTEUR_REFUSE", "application"],
      ["DEUXIEME_FACTEUR_REFUSE", "application"],
      ["DEUXIEME_FACTEUR_REFUSE", "application"],
      ["COMPTE_BLOQUE", "trop-d-essais-de-deuxieme-facteur"],
    ]);
    for (const ligne of lignes) {
      expect(ligne.utilisateurId).toBe(compte.id);
      expect(ligne.ip).toBe("192.0.2.5");
    }

    // Ni la clé TOTP, ni le code, ni les codes de secours, ni les jetons.
    await journalSans([cle, code, ...backupCodes, premier.otp]);
  });
});
