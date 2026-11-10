// Connexion d'un compte de test par code e-mail, sans passer par l'écran
// (déjà prouvé par e2e/connexion.spec.ts) : demande du code sur
// /api/auth, lecture dans Mailpit, puis saisie. Le cookie de session est
// posé dans le contexte du navigateur de `page`.
// Prérequis : Mailpit lancé (API sur http://localhost:8025, ou MAILPIT_URL).
import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";
import { attendrePasSuivant, codeTotp, pasTotp } from "./totp";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
// Better Auth vérifie l'origine (protection CSRF) : même port que
// playwright.config.ts.
export const ORIGINE = `http://localhost:${process.env.E2E_PORT ?? "3000"}`;

export function nettoyer() {
  execFileSync("npx", ["tsx", "e2e/nettoyage.ts"], { stdio: "inherit" });
}

export async function seConnecter(page: Page, email: string) {
  const request = page.context().request;
  const recherche = encodeURIComponent(`to:"${email}"`);
  await request.delete(`${MAILPIT}/api/v1/search?query=${recherche}`);

  const envoi = await request.post("/api/auth/email-otp/send-verification-otp", {
    data: { email, type: "sign-in" },
    headers: { origin: ORIGINE },
  });
  expect(envoi.status()).toBe(200);

  // Le code figure dans le sujet ; l'e-mail part sans être attendu.
  let code = "";
  await expect(async () => {
    const reponse = await request.get(`${MAILPIT}/api/v1/search?query=${recherche}&limit=1`);
    const { messages } = (await reponse.json()) as { messages: { Subject: string }[] };
    const trouve = messages[0]?.Subject.match(/(\d{6})$/);
    expect(trouve).toBeTruthy();
    code = trouve![1];
  }).toPass({ timeout: 10_000 });

  const connexion = await request.post("/api/auth/sign-in/email-otp", {
    data: { email, otp: code },
    headers: { origin: ORIGINE },
  });
  expect(connexion.status()).toBe(200);
}

// Clé TOTP des comptes du personnel enrôlés pendant ce fichier de test, et
// dernier pas de 30 s utilisé (le serveur refuse un code déjà servi).
const CLES_TOTP = new Map<string, string>();
const DERNIER_PAS = new Map<string, number>();

export function cleTotpConnue(email: string): string | undefined {
  return CLES_TOTP.get(email);
}

// Connexion complète d'un employé ou d'un administrateur : code e-mail, puis
// second facteur (enrôlement au premier passage), par les routes HTTP de
// Better Auth. Le code TOTP est calculé à partir de la clé (e2e/totp.ts).
export async function seConnecterPersonnel(page: Page, email: string) {
  await seConnecter(page, email);
  const request = page.context().request;

  // Toujours tenter l'enrôlement : le compte a pu être recréé par le
  // nettoyage depuis la dernière fois. Déjà enrôlé : on reprend la clé notée.
  const enrolement = await request.post("/api/auth/two-factor/enable", {
    data: { method: "totp" },
    headers: { origin: ORIGINE },
  });
  let cle: string | undefined;
  if (enrolement.status() === 200) {
    const { totpURI } = (await enrolement.json()) as { totpURI: string };
    cle = new URL(totpURI).searchParams.get("secret")!;
    CLES_TOTP.set(email, cle);
    DERNIER_PAS.delete(email);
  } else {
    expect((await enrolement.json()).code).toBe("TOTP_ALREADY_ENABLED");
    cle = CLES_TOTP.get(email);
    expect(cle, `clé TOTP inconnue pour ${email}`).toBeTruthy();
  }

  const dernier = DERNIER_PAS.get(email);
  if (dernier !== undefined) await attendrePasSuivant(dernier);
  DERNIER_PAS.set(email, pasTotp());
  const verification = await request.post("/api/auth/two-factor/verify-totp", {
    data: { code: codeTotp(cle!) },
    headers: { origin: ORIGINE },
  });
  expect(verification.status(), await verification.text()).toBe(200);
}
