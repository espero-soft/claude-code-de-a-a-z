// Règle R3 dans le navigateur : deux réservations confirmées ne peuvent pas se
// chevaucher sur la même salle. S'appuie sur la réservation CONFIRMÉE du seed
// (Horizon, un mardi à venir, voir src/lib/date-demo.ts de 10 h à 12 h) : lancer `npm run db:seed` avant.
import { execFileSync } from "node:child_process";
import { dateDemo } from "../src/lib/date-demo";
import { expect, test, type Page } from "@playwright/test";
import { seConnecter } from "./session";

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
  // Listes déroulantes de 30 en 30 minutes : on choisit par la valeur (« 11:00 »).
  await page.getByLabel("Heure de début").selectOption(heureDebut);
  await page.getByLabel("Heure de fin").selectOption(heureFin);
  // Nom et e-mail viennent du compte : plus de champ e-mail. Le compte de
  // test n'a pas encore de nom (créé par le code) : il est demandé.
  await expect(page.getByLabel("Votre adresse e-mail")).toHaveCount(0);
  await expect(page.getByRole("main").getByText(EMAIL_TEST)).toBeVisible();
  await page.getByLabel("Votre nom").fill("Test Playwright");
  await page.getByRole("button", { name: "Envoyer la demande" }).click();
}

test("R3 : 11 h à 12 h 30 est refusé, 12 h à 13 h est accepté", async ({ page }) => {
  // Réserver demande un compte (module 12).
  await seConnecter(page, EMAIL_TEST);
  // Chevauche 10 h à 12 h : refusé, on reste sur le formulaire.
  await demanderHorizon(page, "11:00", "12:30");
  // Filtre par texte : Next ajoute sa propre zone role="alert" (annonce de route).
  await expect(page.getByRole("alert").filter({ hasText: MESSAGE_R3 })).toBeVisible();
  await expect(page).toHaveURL(/\/salles\/[^/]+\/reserver$/);

  // Commence quand l'autre finit : les créneaux se touchent sans se chevaucher.
  // La demande refusée n'a rien enregistré : le nom est encore demandé.
  await demanderHorizon(page, "12:00", "13:00");
  await expect(page).toHaveURL(/\/reservations\/[^/]+$/);
  await expect(
    page.getByRole("heading", { name: "Demande de réservation enregistrée" }),
  ).toBeVisible();
  await expect(page.getByText("de 12 h à 13 h", { exact: true })).toBeVisible();
  // R5 : 1 h à 40 € de l'heure. Le montant est stocké en centimes (4000) et
  // doit être divisé par 100 à l'affichage, sinon la page montre 4 000,00 €.
  // Intl sépare le nombre et « € » par une espace insécable : d'où le \s.
  await expect(page.getByText(/^40,00\s€$/)).toBeVisible();
});

test("le nom saisi une fois est gardé dans le compte et n'est plus demandé", async ({ page }) => {
  // Le compte de test a réservé dans le test précédent, avec son nom.
  await seConnecter(page, EMAIL_TEST);
  await page.goto("/salles");
  await page.getByRole("link", { name: "Horizon", exact: true }).click();
  await page.getByRole("link", { name: "Réserver cette salle" }).click();
  await expect(page.getByLabel("Date")).toBeVisible();
  await expect(page.getByLabel("Votre nom")).toHaveCount(0);
  await expect(page.getByRole("main").getByText("Test Playwright")).toBeVisible();
  await expect(page.getByRole("main").getByText(EMAIL_TEST)).toBeVisible();
});
