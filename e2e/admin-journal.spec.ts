// Journal des connexions (/admin/journal, SECURITE.md section 15) :
// l'administrateur y arrive par la navigation, retrouve un code refusé et la
// connexion qui a suivi, filtre par adresse e-mail ; le code n'apparaît nulle
// part. L'employé ne voit pas le lien et reçoit un vrai 404, comme le client.
// Prérequis : Mailpit lancé (connexion par code). Comptes de e2e/comptes-roles.ts.
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { COMPTES_ROLES } from "./roles-exemple";
import { nettoyer, ORIGINE, seConnecter, seConnecterPersonnel } from "./session";

const { clientA, clientB, employe, admin } = COMPTES_ROLES;

test.beforeAll(() => {
  nettoyer();
  execFileSync("npx", ["tsx", "e2e/comptes-roles.ts"], { stdio: "ignore" });
});
test.afterAll(nettoyer);

const navigation = (page: Page) =>
  page.getByRole("navigation", { name: "Navigation principale" });

test("l'administrateur retrouve un code refusé, filtre par adresse, sans voir aucun code", async ({
  browser,
  page,
}) => {
  // Le client B se trompe de code, puis se connecte (autre navigateur).
  const contexteClient = await browser.newContext({ userAgent: "Mozilla/5.0 (iPhone) Version/18.0 Safari/604.1" });
  const client = await contexteClient.newPage();
  const faux = await client.request.post("/api/auth/sign-in/email-otp", {
    data: { email: clientB.email, otp: "000000" },
    headers: { origin: ORIGINE },
  });
  expect(faux.status()).toBe(400);
  await seConnecter(client, clientB.email);
  await contexteClient.close();

  await seConnecterPersonnel(page, admin.email);
  await page.goto("/");
  await navigation(page).getByRole("link", { name: "Journal" }).click();

  await expect(page).toHaveURL(/\/admin\/journal$/);
  await expect(page.getByRole("heading", { level: 1, name: "Journal des connexions" })).toBeVisible();
  await expect(navigation(page).getByRole("link", { name: "Journal" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // Filtre par une partie de l'adresse, en majuscules.
  await page.getByLabel("Adresse e-mail").fill("CLIENT-B@");
  await page.getByRole("button", { name: "Filtrer" }).click();
  await expect(page).toHaveURL(/\?email=CLIENT-B%40$/);

  const tableau = page.getByRole("table");
  await expect(tableau).toBeVisible();
  const lignes = tableau.locator("tbody").getByRole("row");
  // Les plus récents d'abord : connexion, code demandé, code refusé.
  await expect(lignes).toHaveCount(3);
  await expect(lignes.nth(0)).toContainText("Connexion réussie");
  await expect(lignes.nth(1)).toContainText("Code demandé");
  await expect(lignes.nth(2)).toContainText("Code refusé");
  await expect(lignes.nth(2)).toContainText("Code incorrect");
  await expect(lignes.nth(2)).toContainText("Safari sur iPhone");
  for (let i = 0; i < 3; i++) await expect(lignes.nth(i)).toContainText(clientB.email);
  await expect(page.getByText("Dont 1 échec ou blocage.")).toBeVisible();

  // Ni l'administrateur ni un autre compte dans le résultat filtré, et aucun
  // code à 6 chiffres sur la page.
  await expect(tableau.getByText(admin.email)).toHaveCount(0);
  await expect(tableau.getByText(clientA.email)).toHaveCount(0);
  expect(await page.locator("main").innerText()).not.toMatch(/\b\d{6}\b/);

  await page.getByRole("link", { name: "Tout afficher" }).click();
  await expect(page).toHaveURL(/\/admin\/journal$/);
  await expect(tableau.getByText(admin.email).first()).toBeVisible();
  await expect(tableau.getByText("Second facteur validé").first()).toBeVisible();
});

test("l'employé ne voit pas le lien « Journal » et reçoit un 404", async ({ page }) => {
  await seConnecterPersonnel(page, employe.email);
  await page.goto("/");
  await expect(navigation(page).getByRole("link", { name: "Tickets" })).toBeVisible();
  await expect(navigation(page).getByRole("link", { name: "Journal" })).toHaveCount(0);

  const reponse = await page.goto("/admin/journal");
  expect(reponse?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Journal des connexions" })).toHaveCount(0);
});

test("un client reçoit un 404, un visiteur est renvoyé vers la connexion", async ({ browser, page }) => {
  await seConnecter(page, clientA.email);
  const reponse = await page.goto("/admin/journal?email=x");
  expect(reponse?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Journal des connexions" })).toHaveCount(0);

  const visiteur = await (await browser.newContext()).newPage();
  await visiteur.goto("/admin/journal");
  await expect(visiteur).toHaveURL(/\/connexion\?retour=%2Fadmin%2Fjournal$/);
});

test("reste lisible sur mobile : une carte par événement, sans défilement de côté", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seConnecterPersonnel(page, admin.email);
  await page.goto(`/admin/journal?email=${encodeURIComponent(admin.email)}`);
  await expect(page.getByRole("heading", { level: 1, name: "Journal des connexions" })).toBeVisible();
  const liste = page.getByRole("list", { name: "Événements, du plus récent au plus ancien" });
  await expect(liste.getByRole("listitem").first()).toBeVisible();
  await expect(liste.getByText(admin.email).first()).toBeVisible();
  await expect(page.getByRole("table")).toBeHidden();
  const largeurPage = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(largeurPage).toBeLessThanOrEqual(390);
});
