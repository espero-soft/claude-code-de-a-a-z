// Espace client (/compte) : on y arrive par « Mes réservations » dans la
// navigation ; les réservations de Claire y sont rangées (à venir, en attente,
// passées et annulées) avec les actions de leur statut ; une réservation faite
// sans compte à son adresse vérifiée lui est rattachée à la connexion, celle
// d'une autre adresse non. Sur ordinateur et sur mobile.
// Prérequis : `npm run db:seed`, Mailpit lancé (connexion par code).
// Données : e2e/espace-client-exemple.ts, supprimées par e2e/nettoyage.ts.
import { execFileSync } from "node:child_process";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { CLAIRE, COMPTES_ROLES } from "./roles-exemple";
import { nettoyer, seConnecter } from "./session";

type Ids = Record<
  "prochaine" | "ensuite" | "enAttente" | "passee" | "annulee" | "sansCompte" | "autreAdresse",
  string
>;
let ids: Ids;

test.beforeAll(() => {
  nettoyer();
  const sortie = execFileSync("npx", ["tsx", "e2e/espace-client-exemple.ts"], { encoding: "utf8" });
  ids = JSON.parse(sortie) as Ids;
});
test.afterAll(nettoyer);

const navigation = (page: Page) =>
  page.getByRole("navigation", { name: "Navigation principale" });
const rubrique = (page: Page, titre: string) =>
  page.getByRole("region", { name: titre, exact: true });
// Montant formaté en euros (espace insécable avant « € ») : attrape un oubli
// de division par 100.
const euros = (texte: string) => new RegExp(`^${texte}\\s€$`);

function compteur(page: Page, libelle: string): Locator {
  return page
    .getByRole("list", { name: "Vos réservations en chiffres" })
    .getByRole("link", { name: new RegExp(`^${libelle}`) });
}

test("un visiteur est renvoyé vers la connexion", async ({ page }) => {
  await page.goto("/compte");
  await expect(page).toHaveURL(/\/connexion\?retour=%2Fcompte$/);
});

test("affiche les réservations de Claire, rangées, avec les actions de leur statut", async ({
  page,
}) => {
  // La connexion rattache la réservation faite sans compte à son adresse.
  await seConnecter(page, CLAIRE.email);
  await page.goto("/");
  await navigation(page).getByRole("link", { name: "Mes réservations" }).click();

  await expect(page).toHaveURL(/\/compte$/);
  await expect(page).toHaveTitle("Mes réservations");
  await expect(page.getByRole("heading", { level: 1, name: "Bonjour, Claire" })).toBeVisible();
  await expect(navigation(page).getByRole("link", { name: "Mes réservations" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // Un seul bouton cuivre (charte) : réserver.
  await expect(page.getByRole("link", { name: "Réserver une salle" })).toHaveAttribute(
    "href",
    "/salles",
  );

  // Compteurs : 3 à venir (dont celle faite sans compte), 1 en attente,
  // 2 passées ou annulées. Celle d'une autre adresse n'est comptée nulle part.
  await expect(compteur(page, "À venir")).toContainText("3");
  await expect(compteur(page, "En attente")).toContainText("1");
  await expect(compteur(page, "Passées et annulées")).toContainText("2");

  // Prochaine réservation : la confirmée la plus proche, sans « Payer ».
  const prochaine = page.getByRole("region", { name: "Prochaine réservation" });
  await expect(prochaine.getByRole("heading", { name: "L'Atelier" })).toBeVisible();
  await expect(prochaine.getByText("Confirmée")).toBeVisible();
  await expect(prochaine.getByText("de 9 h à 11 h", { exact: true })).toBeVisible();
  await expect(prochaine.getByText(euros("50,00"))).toBeVisible(); // 2 h × 25 €
  await expect(prochaine.getByRole("button", { name: /Payer/ })).toHaveCount(0);
  await expect(prochaine.getByRole("link", { name: /^Voir le détail/ })).toHaveAttribute(
    "href",
    `/reservations/${ids.prochaine}`,
  );

  // En attente : payer (marine, le cuivre est pris), délai R6 affiché.
  const attente = rubrique(page, "En attente de paiement");
  await expect(attente.getByRole("listitem")).toHaveCount(1);
  await expect(attente.getByRole("heading", { name: "Agora" })).toBeVisible();
  await expect(
    attente.getByRole("listitem").getByText("En attente de paiement", { exact: true }),
  ).toBeVisible();
  await expect(attente.getByRole("button", { name: "Payer 75,00 €" })).toBeVisible();
  await expect(attente.getByText(/^À payer avant \d{1,2} h/)).toBeVisible();

  // Ensuite : les deux autres confirmées, dont celle faite sans compte.
  const ensuite = rubrique(page, "Ensuite");
  await expect(ensuite.getByRole("listitem")).toHaveCount(2);
  await expect(ensuite.getByText("de 8 h à 9 h", { exact: true })).toBeVisible();
  await expect(ensuite.getByRole("button", { name: /Payer/ })).toHaveCount(0);

  // Passées et annulées : réserver de nouveau, jamais payer.
  const passees = rubrique(page, "Passées et annulées");
  await expect(passees.getByRole("listitem")).toHaveCount(2);
  const terminee = passees.getByRole("listitem").filter({ hasText: "Horizon" });
  await expect(terminee.getByText("Terminée")).toBeVisible();
  await expect(terminee.getByRole("link", { name: /^Réserver à nouveau/ })).toBeVisible();
  const annulee = passees.getByRole("listitem").filter({ hasText: "Annulée" });
  await expect(annulee.getByRole("heading", { name: "Agora" })).toBeVisible();
  await expect(annulee.getByRole("link", { name: /^Choisir un autre créneau/ })).toBeVisible();
  await expect(passees.getByRole("button", { name: /Payer/ })).toHaveCount(0);

  // Ni la réservation d'une autre adresse, ni ses données.
  await expect(page.getByRole("main").getByText("Autre personne")).toHaveCount(0);
  await expect(page.locator(`a[href="/reservations/${ids.autreAdresse}"]`)).toHaveCount(0);

  // La réservation rattachée s'ouvre : Claire en est désormais titulaire.
  await page.locator(`a[href="/reservations/${ids.sansCompte}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/reservations/${ids.sansCompte}$`));
  await expect(page.getByRole("heading", { name: "Réservation confirmée" })).toBeVisible();
});

test("la réservation d'une autre adresse reste invisible et inaccessible pour Claire", async ({
  page,
}) => {
  await seConnecter(page, CLAIRE.email);
  await page.goto(`/reservations/${ids.autreAdresse}`);
  await expect(page).toHaveTitle("Page introuvable");
  await expect(page.getByText("Autre personne")).toHaveCount(0);
});

test("un autre client ne voit aucune réservation de Claire", async ({ page }) => {
  await seConnecter(page, COMPTES_ROLES.clientB.email);
  await page.goto("/compte");
  await expect(page.getByRole("heading", { level: 1, name: "Bonjour", exact: true })).toBeVisible();
  await expect(compteur(page, "À venir")).toContainText("0");
  await expect(page.getByRole("main").getByText("L'Atelier")).toHaveCount(0);
});

test("sur mobile, l'espace client s'ouvre par le menu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seConnecter(page, CLAIRE.email);
  await page.goto("/");
  // Attendre la zone du compte (en flux) : le menu est alors interactif.
  const enTete = page.getByRole("banner");
  await expect(enTete.getByText("C", { exact: true }).filter({ visible: true })).toBeVisible();
  await enTete.getByRole("button", { name: "Menu" }).click();
  await navigation(page).getByRole("link", { name: "Mes réservations" }).click();

  await expect(page).toHaveURL(/\/compte$/);
  await expect(page.getByRole("heading", { level: 1, name: "Bonjour, Claire" })).toBeVisible();
  await expect(
    rubrique(page, "En attente de paiement").getByRole("button", { name: "Payer 75,00 €" }),
  ).toBeVisible();
  // Rien ne déborde horizontalement.
  const largeur = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(largeur).toBeLessThanOrEqual(390);
});
