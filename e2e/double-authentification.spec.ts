// Second facteur obligatoire pour l'employé et l'administrateur (SECURITE.md,
// section 13). Sans téléphone : le code TOTP est calculé à partir de la clé
// affichée à l'enrôlement (e2e/totp.ts, RFC 6238 sur node:crypto).
// Prérequis : Mailpit lancé (code de connexion par e-mail).
// Comptes @roles.example.com, supprimés par e2e/nettoyage.ts.
import { execFileSync } from "node:child_process";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { COMPTES_ROLES } from "./roles-exemple";
import { cleTotpConnue, nettoyer, ORIGINE, seConnecter, seConnecterPersonnel } from "./session";
import { attendrePasSuivant, codeTotp, pasTotp } from "./totp";

let numero = 0;
// Un compte du personnel neuf par test : enrôlements et compteurs séparés.
function nouveauCompte(role: "EMPLOYE" | "ADMIN" | "CLIENT" = "EMPLOYE") {
  const email = `personnel-${Date.now()}-${numero++}@roles.example.com`;
  execFileSync("npx", ["tsx", "e2e/creer-compte.ts", email, role], { stdio: "inherit" });
  return email;
}

let reservationClient = "";
test.beforeAll(() => {
  nettoyer();
  const sortie = execFileSync("npx", ["tsx", "e2e/comptes-roles.ts"], { encoding: "utf8" });
  reservationClient = (JSON.parse(sortie) as { reservationId: string }).reservationId;
});
test.afterAll(nettoyer);

const poster = (request: APIRequestContext, chemin: string, data: object) =>
  request.post(`/api/auth${chemin}`, { data, headers: { origin: ORIGINE } });

// Enrôlement par l'écran ; renvoie la clé et les codes de secours affichés.
async function enrolerParEcran(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "Double authentification" })).toBeVisible();
  await page.getByRole("button", { name: "Configurer l'application" }).click();

  await expect(page.getByRole("img", { name: /^QR code à scanner/ })).toBeVisible();
  const cle = (await page.getByLabel("Clé de configuration").innerText()).replace(/\s/g, "");
  expect(cle).toMatch(/^[A-Z2-7]{16,}$/);
  const codesSecours = await page.getByRole("list", { name: "Codes de secours" }).getByRole("listitem").allInnerTexts();
  expect(codesSecours).toHaveLength(10);
  return { cle, codesSecours };
}

const champCode = (page: Page) => page.getByLabel("Code à 6 chiffres de l'application");

test("un employé est guidé : enrôlement au premier passage, puis les tickets", async ({ page }) => {
  const email = nouveauCompte();
  await seConnecter(page, email);

  // Code e-mail seul : /admin renvoie vers le second facteur, puis y ramène.
  await page.goto("/admin/tickets");
  await expect(page).toHaveURL(/\/double-authentification\?retour=%2Fadmin%2Ftickets$/);
  const { cle } = await enrolerParEcran(page);

  // Un faux code est refusé, avec un message en français.
  const bon = codeTotp(cle);
  await champCode(page).fill(`${(Number(bon[0]) + 1) % 10}${bon.slice(1)}`);
  await page.getByRole("button", { name: "Confirmer et continuer" }).click();
  await expect(page.getByText(/^Code incorrect\./)).toBeVisible();

  // Le bon code, calculé comme une application, confirme et ouvre /admin.
  await champCode(page).fill(codeTotp(cle));
  await page.getByRole("button", { name: "Confirmer et continuer" }).click();
  await expect(page).toHaveURL(/\/admin\/tickets$/);
  await expect(page.getByRole("heading", { level: 1, name: "Tickets du support" })).toBeVisible();

  // La clé n'est montrée qu'une fois : revenir sur la page ne la réaffiche pas.
  await page.goto("/double-authentification");
  await expect(page).toHaveURL(/\/admin\/tickets$/);
  await expect(page.getByLabel("Clé de configuration")).toHaveCount(0);
});

test("à chaque nouvelle session, le code de l'application est redemandé", async ({ page, browser }) => {
  // Attend au plus un pas TOTP (30 s) pour obtenir un code neuf.
  test.setTimeout(90_000);
  const email = nouveauCompte("ADMIN");
  await seConnecterPersonnel(page, email); // enrôlement par HTTP
  const cle = cleTotpConnue(email)!;
  const pasEnrolement = pasTotp();

  // Nouvelle session (autre navigateur) : code e-mail seul, /admin fermé.
  const autre = await (await browser.newContext()).newPage();
  await seConnecter(autre, email);
  await autre.goto("/admin/tickets");
  await expect(autre).toHaveURL(/\/double-authentification/);
  // Formulaire de code, plus d'enrôlement : ni QR code ni clé.
  await expect(champCode(autre)).toBeVisible();
  await expect(autre.getByRole("button", { name: "Configurer l'application" })).toHaveCount(0);
  await expect(autre.getByLabel("Clé de configuration")).toHaveCount(0);

  // Les réservations des clients restent fermées tant que le code manque.
  await autre.goto(`/reservations/${reservationClient}`);
  await expect(autre).toHaveURL(/\/double-authentification/);
  await expect(autre.getByText(COMPTES_ROLES.clientA.nom)).toHaveCount(0);

  // Le code saisi, on revient à la réservation demandée, qui s'ouvre enfin.
  await attendrePasSuivant(pasEnrolement);
  await champCode(autre).fill(codeTotp(cle));
  await autre.getByRole("button", { name: "Valider" }).click();
  await expect(autre).toHaveURL(new RegExp(`/reservations/${reservationClient}$`));
  await expect(autre.getByRole("main").getByText(COMPTES_ROLES.clientA.nom)).toBeVisible();
});

test("un code déjà servi est refusé (anti-rejeu)", async ({ page, browser }) => {
  // Attend au plus un pas TOTP (30 s) pour obtenir un code neuf.
  test.setTimeout(90_000);
  const email = nouveauCompte();
  await seConnecterPersonnel(page, email);
  const cle = cleTotpConnue(email)!;
  await attendrePasSuivant(pasTotp());

  // Deux sessions, le même code : le premier passe, le second est refusé.
  const code = codeTotp(cle);
  const sessions = [];
  for (let i = 0; i < 2; i++) {
    const contexte = await browser.newContext();
    const autre = await contexte.newPage();
    await seConnecter(autre, email);
    sessions.push(contexte.request);
  }
  expect((await poster(sessions[0], "/two-factor/verify-totp", { code })).status()).toBe(200);
  const rejeu = await poster(sessions[1], "/two-factor/verify-totp", { code });
  expect(rejeu.status()).toBe(401);
  expect((await rejeu.json()).code).toBe("CODE_DEJA_UTILISE");
});

test("un code de secours ouvre la session une seule fois", async ({ page, browser }) => {
  const email = nouveauCompte();
  await seConnecter(page, email);
  await page.goto("/double-authentification");
  const { cle, codesSecours } = await enrolerParEcran(page);
  await champCode(page).fill(codeTotp(cle));
  await page.getByRole("button", { name: "Confirmer et continuer" }).click();
  await expect(page).toHaveURL(/\/admin\/tickets$/);

  for (const [essai, attendu] of [
    ["premier", "ouvert"],
    ["second", "refusé"],
  ] as const) {
    const autre = await (await browser.newContext()).newPage();
    await seConnecter(autre, email);
    await autre.goto("/double-authentification");
    await autre.getByRole("button", { name: "Utiliser un code de secours" }).click();
    await autre.getByLabel("Code de secours").fill(codesSecours[0]);
    await autre.getByRole("button", { name: "Valider" }).click();
    if (attendu === "ouvert") {
      await expect(autre, essai).toHaveURL(/\/admin\/tickets$/);
    } else {
      await expect(autre.getByText(/ne sert qu'une fois/).filter({ visible: true })).toBeVisible();
      await expect(autre).toHaveURL(/\/double-authentification/);
    }
  }
});

test("les routes qui livreraient le second facteur à la seule session e-mail sont fermées", async ({
  page,
}) => {
  const email = nouveauCompte();
  await seConnecterPersonnel(page, email);
  const request = page.context().request;

  // Relire la clé, la désactiver, régénérer les codes de secours : 404.
  for (const chemin of [
    "/two-factor/get-totp-uri",
    "/two-factor/disable",
    "/two-factor/generate-backup-codes",
    "/two-factor/send-otp",
  ]) {
    expect((await poster(request, chemin, {})).status(), chemin).toBe(404);
  }
  // Ré-enrôler par-dessus (nouvelle clé choisie par un intrus) : refusé.
  const reenrolement = await poster(request, "/two-factor/enable", { method: "totp" });
  expect(reenrolement.status()).toBe(400);
  expect((await reenrolement.json()).code).toBe("TOTP_ALREADY_ENABLED");
});

test("un client ne peut ni s'enrôler ni ouvrir l'écran", async ({ page }) => {
  const email = nouveauCompte("CLIENT");
  await seConnecter(page, email);
  const enrolement = await poster(page.context().request, "/two-factor/enable", { method: "totp" });
  expect(enrolement.status()).toBe(403);
  await page.goto("/double-authentification");
  await expect(page).toHaveTitle("Page introuvable");
});

test("5 essais par heure et par compte, même si le 6e est le bon", async ({ page }) => {
  // Attend au plus un pas TOTP (30 s) pour obtenir un code neuf.
  test.setTimeout(90_000);
  const email = nouveauCompte();
  await seConnecterPersonnel(page, email); // 1 essai réussi : compteur remis à zéro
  const cle = cleTotpConnue(email)!;
  await seConnecter(page, email); // nouvelle session, à valider
  const request = page.context().request;

  const bon = codeTotp(cle);
  const faux = `${(Number(bon[0]) + 5) % 10}${bon.slice(1)}`;
  for (let i = 0; i < 5; i++) {
    expect((await poster(request, "/two-factor/verify-totp", { code: faux })).status()).toBe(401);
  }
  await attendrePasSuivant(pasTotp());
  const sixieme = await poster(request, "/two-factor/verify-totp", { code: codeTotp(cle) });
  expect(sixieme.status()).toBe(429);
  expect((await sixieme.json()).code).toBe("TROP_D_ESSAIS_DE_DEUXIEME_FACTEUR");
  await page.goto("/admin/tickets");
  await expect(page).toHaveURL(/\/double-authentification/);
});

test("sur mobile, l'enrôlement tient dans l'écran", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const email = nouveauCompte();
  await seConnecter(page, email);
  await page.goto("/double-authentification");
  const { cle } = await enrolerParEcran(page);
  const largeur = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(largeur).toBeLessThanOrEqual(390);
  await champCode(page).fill(codeTotp(cle));
  await page.getByRole("button", { name: "Confirmer et continuer" }).click();
  await expect(page).toHaveURL(/\/admin\/tickets$/);
});
