// Page « Démonstration » : on y arrive depuis l'accueil, par la navigation
// principale ou par le bandeau affiché sur chaque page. Elle annonce les
// paiements simulés (carte de test), les réservations non réelles, les données
// conservées et la fin du site. Page statique, sans lecture en base ; le
// serveur de dev est démarré ou réutilisé par playwright.config.ts
// (`npm run db:seed` comme pour les autres tests).
import { expect, test } from "@playwright/test";

test("présente le site de démonstration depuis la navigation", async ({ page }) => {
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Navigation principale" });
  await navigation.getByRole("link", { name: "Démonstration" }).click();

  await expect(page).toHaveURL(/\/demonstration$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Site de démonstration" }),
  ).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Démonstration" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(navigation.getByRole("link", { name: "Accueil" })).not.toHaveAttribute(
    "aria-current",
  );

  for (const titre of [
    "Les paiements sont simulés",
    "Les réservations ne sont pas réelles",
    "Vos données",
    "Un site temporaire",
  ]) {
    await expect(page.getByRole("heading", { level: 2, name: titre })).toBeVisible();
  }
  await expect(page.getByText("4242 4242 4242 4242")).toBeVisible();
  await expect(page.getByText(/effacées au bout de 90 jours/)).toBeVisible();
});

test("affiche le bandeau de démonstration sur chaque page, avec un lien vers ses détails", async ({
  page,
}) => {
  for (const chemin of ["/", "/salles", "/aide", "/connexion"]) {
    await page.goto(chemin);
    const bandeau = page.getByRole("complementary", { name: "Site de démonstration" });
    await expect(bandeau).toContainText("aucune somme n'est prélevée");
  }

  await page
    .getByRole("complementary", { name: "Site de démonstration" })
    .getByRole("link", { name: "En savoir plus" })
    .click();
  await expect(page).toHaveURL(/\/demonstration$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Site de démonstration" }),
  ).toBeVisible();
});
