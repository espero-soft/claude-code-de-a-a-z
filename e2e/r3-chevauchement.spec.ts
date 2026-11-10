// Règle R3 dans le navigateur : deux réservations confirmées ne peuvent pas se
// chevaucher sur la même salle. S'appuie sur la réservation CONFIRMÉE du seed
// (Horizon, un mardi à venir, voir src/lib/date-demo.ts de 10 h à 12 h) : lancer `npm run db:seed` avant.
import { execFileSync } from "node:child_process";
import { dateDemo } from "../src/lib/date-demo";
import { expect, test, type Page } from "@playwright/test";

const DATE_DEMO = dateDemo();
const EMAIL_TEST = "playwright@example.com"; // voir e2e/nettoyage.ts
const MESSAGE_R3 =
  "Cette salle est déjà réservée de 10 h à 12 h. Choisissez un autre horaire.";

// Retire de dev.db les réservations créées par ce test (et par un passage
// interrompu), pour que la base reste dans l'état du seed.
function nettoyer() {
  execFileSync("npx", ["tsx", "e2e/nettoyage.ts"], { stdio: "inherit" });
}
test.beforeAll(nettoyer);
test.afterAll(nettoyer);

async function demanderHorizon(page: Page, heureDebut: string, heureFin: string) {
  // La liste n'a plus de bouton par carte (un seul cuivre par écran) : on
  // ouvre la fiche, puis « Réserver cette salle ».
  await page.goto("/salles");
  await page.getByRole("link", { name: "Horizon", exact: true }).click();
  await page.getByRole("link", { name: "Réserver cette salle" }).click();
  await expect(page.getByLabel("Date")).toBeVisible();

  await page.getByLabel("Date").fill(DATE_DEMO);
  await page.getByLabel("Heure de début").fill(heureDebut);
  await page.getByLabel("Heure de fin").fill(heureFin);
  await page.getByLabel("Votre nom").fill("Test Playwright");
  await page.getByLabel("Votre adresse e-mail").fill(EMAIL_TEST);
  await page.getByRole("button", { name: "Envoyer la demande" }).click();
}

test("R3 : 11 h à 12 h 30 est refusé, 12 h à 13 h est accepté", async ({ page }) => {
  // Chevauche 10 h à 12 h : refusé, on reste sur le formulaire.
  await demanderHorizon(page, "11:00", "12:30");
  // Filtre par texte : Next ajoute sa propre zone role="alert" (annonce de route).
  await expect(page.getByRole("alert").filter({ hasText: MESSAGE_R3 })).toBeVisible();
  await expect(page).toHaveURL(/\/salles\/[^/]+\/reserver$/);

  // Commence quand l'autre finit : les créneaux se touchent sans se chevaucher.
  await demanderHorizon(page, "12:00", "13:00");
  await expect(page).toHaveURL(/\/reservations\/[^/]+$/);
  await expect(
    page.getByRole("heading", { name: "Demande de réservation enregistrée" }),
  ).toBeVisible();
  await expect(page.getByText("de 12:00 à 13:00")).toBeVisible();
  // R5 : 1 h à 40 € de l'heure. Le montant est stocké en centimes (4000) et
  // doit être divisé par 100 à l'affichage, sinon la page montre 4 000,00 €.
  // Intl sépare le nombre et « € » par une espace insécable : d'où le \s.
  await expect(page.getByText(/^40,00\s€$/)).toBeVisible();
});
