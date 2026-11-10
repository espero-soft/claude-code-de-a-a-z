// Page d'aide : on y arrive depuis l'accueil par la navigation principale, et
// elle présente les règles de réservation (durée, horaires, montant, paiement).
// Page statique, sans lecture en base ; le serveur de dev est démarré ou
// réutilisé par playwright.config.ts (`npm run db:seed` comme pour les autres tests).
import { expect, test } from "@playwright/test";

test("affiche les règles de réservation depuis la navigation", async ({ page }) => {
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Navigation principale" });
  await navigation.getByRole("link", { name: "Aide" }).click();

  await expect(page).toHaveURL(/\/aide$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Règles de réservation" }),
  ).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Aide" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(navigation.getByRole("link", { name: "Accueil" })).not.toHaveAttribute(
    "aria-current",
  );

  // Une carte par règle du cahier des charges (R1 à R6).
  for (const titre of [
    "Durée d'une réservation",
    "Jours et horaires d'ouverture",
    "Pas de réservation dans le passé",
    "Une salle, une réservation à la fois",
    "Calcul du montant",
    "Paiement sous 15 minutes",
  ]) {
    await expect(page.getByRole("heading", { level: 2, name: titre })).toBeVisible();
  }
  await expect(page.getByText(/au minimum 1 heure, par tranches de 30 minutes/)).toBeVisible();
  await expect(page.getByText(/du lundi au vendredi, de 8 h à 20 h/)).toBeVisible();
});

test("garde « Nos salles » actif sur une fiche de salle", async ({ page }) => {
  await page.goto("/salles");
  await page.getByRole("link", { name: "Horizon", exact: true }).click();
  await expect(page).toHaveURL(/\/salles\/[^/]+$/);

  const navigation = page.getByRole("navigation", { name: "Navigation principale" });
  await expect(navigation.getByRole("link", { name: "Nos salles" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
