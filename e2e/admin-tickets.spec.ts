// Écran d'administration des tickets du support : on y arrive par la
// navigation (en développement seulement), les tickets les plus urgents sont en
// tête, le badge « Conseiller requis » signale un ticket à transmettre, et
// « Valider le brouillon » passe le ticket en VALIDE sans rien envoyer.
// Les tickets de test sont créés par e2e/tickets-exemple.ts (sans appel à
// l'API Claude) et retirés par e2e/nettoyage.ts.
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const RESUME_HAUTE = "Test Playwright : double débit signalé.";
const RESUME_BASSE = "Test Playwright : question sur les horaires.";

function nettoyer() {
  execFileSync("npx", ["tsx", "e2e/nettoyage.ts"], { stdio: "inherit" });
}
test.beforeAll(() => {
  nettoyer();
  execFileSync("npx", ["tsx", "e2e/tickets-exemple.ts"], { stdio: "inherit" });
});
test.afterAll(nettoyer);

test("liste les tickets par urgence et valide un brouillon", async ({ page }) => {
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Navigation principale" });
  await navigation.getByRole("link", { name: "Tickets" }).click();

  await expect(page).toHaveURL(/\/admin\/tickets$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Tickets du support" }),
  ).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Tickets" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // Le ticket d'urgence haute, créé après l'autre, passe pourtant devant.
  // La liste arrive en flux (Suspense) : attendre qu'elle soit là avant de lire l'ordre.
  await expect(page.getByRole("heading", { level: 2, name: RESUME_BASSE })).toBeVisible();
  const resumes = await page.getByRole("heading", { level: 2 }).allTextContents();
  expect(resumes.indexOf(RESUME_HAUTE)).toBeGreaterThanOrEqual(0);
  expect(resumes.indexOf(RESUME_HAUTE)).toBeLessThan(resumes.indexOf(RESUME_BASSE));

  const haute = page.getByRole("listitem", { name: RESUME_HAUTE });
  await expect(haute.getByText("Paiement", { exact: true })).toBeVisible();
  await expect(haute.getByText("Urgence haute")).toBeVisible();
  await expect(haute.getByText("Conseiller requis")).toBeVisible();
  await expect(haute.getByText(/réclamation sur un paiement/)).toBeVisible();
  await expect(haute.getByText(/nous vérifions votre paiement/)).toBeVisible();

  const basse = page.getByRole("listitem", { name: RESUME_BASSE });
  await expect(basse.getByText("Urgence basse")).toBeVisible();
  await expect(basse.getByText("Conseiller requis")).toHaveCount(0);

  await haute.getByRole("button", { name: "Valider le brouillon" }).click();
  await expect(haute.getByText("Brouillon validé")).toBeVisible();
  await expect(haute.getByText(/Rien n'a été envoyé au client/)).toBeVisible();
  await expect(haute.getByRole("button", { name: "Valider le brouillon" })).toHaveCount(0);
  // L'autre ticket reste à traiter.
  await expect(basse.getByRole("button", { name: "Valider le brouillon" })).toBeVisible();
});
