// Rôles (module 12) : /admin est fermé à tout autre rôle que l'employé et
// l'administrateur, le lien « Tickets » n'apparaît qu'au personnel, et un
// client ne peut pas s'attribuer un rôle par les routes de Better Auth.
// Le refus des Server Actions appelées directement est prouvé par Vitest
// (src/app/**/actions.test.ts).
// Prérequis : Mailpit lancé (connexion par code).
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { COMPTES_ROLES } from "./roles-exemple";
import { nettoyer, ORIGINE, seConnecter } from "./session";

const { clientB, employe, admin } = COMPTES_ROLES;

test.beforeAll(() => {
  nettoyer();
  execFileSync("npx", ["tsx", "e2e/comptes-roles.ts"], { stdio: "ignore" });
});
test.afterAll(nettoyer);

const navigation = (page: Page) =>
  page.getByRole("navigation", { name: "Navigation principale" });

// Un client sur /admin : vrai 404, aucun contenu de l'administration.
async function attendreAdminFermee(page: Page) {
  const reponse = await page.goto("/admin/tickets");
  expect(reponse?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Tickets du support" })).toHaveCount(0);
}

test("un visiteur est renvoyé vers la connexion, puis ramené à /admin/tickets", async ({ page }) => {
  await page.goto("/admin/tickets");
  await expect(page).toHaveURL(/\/connexion\?retour=%2Fadmin%2Ftickets$/);
  await expect(navigation(page).getByRole("link", { name: "Tickets" })).toHaveCount(0);
});

test("un client reçoit un 404 sur /admin et ne voit pas le lien « Tickets »", async ({ page }) => {
  await seConnecter(page, clientB.email);
  await page.goto("/");
  // L'en-tête arrive en flux : attendre la zone du compte avant de conclure.
  await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible();
  await expect(navigation(page).getByRole("link", { name: "Tickets" })).toHaveCount(0);

  await attendreAdminFermee(page);
  expect((await page.goto("/admin"))?.status()).toBe(404);
});

test("un client ne peut pas s'attribuer le rôle administrateur", async ({ page }) => {
  await seConnecter(page, clientB.email);
  const request = page.context().request;

  // Mise à jour du profil avec un rôle : le champ est refusé (input: false).
  const miseAJour = await request.post("/api/auth/update-user", {
    data: { role: "ADMIN" },
    headers: { origin: ORIGINE },
  });
  expect(miseAJour.ok()).toBe(false);

  // Même tentative glissée dans un appel accepté (nom) : le rôle est ignoré.
  await request.post("/api/auth/update-user", {
    data: { name: "Pirate", role: "ADMIN" },
    headers: { origin: ORIGINE },
  });

  await attendreAdminFermee(page);
});

for (const [libelle, compte] of [
  ["un employé", employe],
  ["l'administrateur", admin],
] as const) {
  test(`${libelle} ouvre les tickets depuis la navigation`, async ({ page }) => {
    await seConnecter(page, compte.email);
    await page.goto("/");
    await navigation(page).getByRole("link", { name: "Tickets" }).click();

    await expect(page).toHaveURL(/\/admin\/tickets$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Tickets du support" }),
    ).toBeVisible();
    await expect(navigation(page).getByRole("link", { name: "Tickets" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
}
