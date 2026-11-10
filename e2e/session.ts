// Connexion d'un compte de test par code e-mail, sans passer par l'écran
// (déjà prouvé par e2e/connexion.spec.ts) : demande du code sur
// /api/auth, lecture dans Mailpit, puis saisie. Le cookie de session est
// posé dans le contexte du navigateur de `page`.
// Prérequis : Mailpit lancé (API sur http://localhost:8025, ou MAILPIT_URL).
import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";

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
