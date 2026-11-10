// Fuite de données personnelles sur /reservations/[id] (SECURITE.md, sections 1
// et 3), corrigée au module 12 : seul le titulaire, un employé ou
// l'administrateur voit une réservation. Pour tous les autres, la réponse est
// celle d'une réservation inexistante (on ne confirme pas qu'elle existe).
// Prérequis : `npm run db:seed` (réservation de démonstration
// « demo-r3-horizon ») et Mailpit lancé (connexion par code).
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { COMPTES_ROLES } from "./roles-exemple";
import { nettoyer, seConnecter } from "./session";

const NOM_DEMO = "Client de démonstration";
const EMAIL_DEMO = "demo@example.com";
const { clientA, clientB, employe, admin } = COMPTES_ROLES;

let reservationId = "";
test.beforeAll(() => {
  nettoyer();
  const sortie = execFileSync("npx", ["tsx", "e2e/comptes-roles.ts"], { encoding: "utf8" });
  reservationId = (JSON.parse(sortie) as { reservationId: string }).reservationId;
});
test.afterAll(nettoyer);

// La page arrive en flux (Suspense) : attendre la fin du rendu avant de
// conclure à l'absence, sinon le test passerait avant l'arrivée des données.
async function ouvrir(page: Page, chemin: string) {
  const reponse = await page.goto(chemin);
  await page.waitForLoadState("networkidle");
  return reponse;
}

// Ce que voit la personne : code HTTP, titre et texte de toute la page.
async function rendu(page: Page, chemin: string) {
  const reponse = await ouvrir(page, chemin);
  return {
    status: reponse?.status(),
    titre: await page.title(),
    texte: await page.locator("body").innerText(),
  };
}

// Contenu de la page, sans l'en-tête (qui affiche l'e-mail du compte connecté).
const contenu = (page: Page) => page.locator("main");

test("un visiteur sans compte ne voit pas le nom ni l'e-mail du client", async ({ page }) => {
  await ouvrir(page, "/reservations/demo-r3-horizon");

  await expect(page.getByText(NOM_DEMO)).toHaveCount(0);
  await expect(page.getByText(EMAIL_DEMO)).toHaveCount(0);
  // Il est invité à se connecter, et ramené ensuite à la réservation.
  await expect(page).toHaveURL(/\/connexion\?retour=%2Freservations%2Fdemo-r3-horizon$/);
});

test("un visiteur reçoit la même réponse qu'il s'agisse d'une vraie réservation ou non", async ({
  page,
}) => {
  await ouvrir(page, `/reservations/${reservationId}`);
  await expect(page).toHaveURL(/\/connexion\?retour=/);
  await ouvrir(page, "/reservations/inexistante");
  await expect(page).toHaveURL(/\/connexion\?retour=%2Freservations%2Finexistante$/);
});

test("un autre client reçoit exactement la réponse d'une réservation inexistante", async ({
  page,
}) => {
  await seConnecter(page, clientB.email);

  const autre = await rendu(page, `/reservations/${reservationId}`);
  const inexistante = await rendu(page, "/reservations/cette-reservation-n-existe-pas");
  expect(autre).toEqual(inexistante);

  expect(autre.texte).not.toContain(clientA.nom);
  expect(autre.texte).not.toContain(clientA.email);
  await expect(page.getByRole("button", { name: /Payer/ })).toHaveCount(0);
});

test("un client ne voit pas une réservation sans titulaire (créée avant les comptes)", async ({
  page,
}) => {
  await seConnecter(page, clientB.email);
  await ouvrir(page, "/reservations/demo-r3-horizon");
  await expect(page.getByText(NOM_DEMO)).toHaveCount(0);
  await expect(page.getByText(EMAIL_DEMO)).toHaveCount(0);
});

test("le titulaire voit sa réservation et peut la payer", async ({ page }) => {
  await seConnecter(page, clientA.email);
  await ouvrir(page, `/reservations/${reservationId}`);

  await expect(
    page.getByRole("heading", { name: "Demande de réservation enregistrée" }),
  ).toBeVisible();
  await expect(contenu(page).getByText(clientA.nom)).toBeVisible();
  await expect(contenu(page).getByText(clientA.email)).toBeVisible();
  await expect(page.getByRole("button", { name: /Payer/ })).toBeVisible();
});

for (const [libelle, compte] of [
  ["un employé", employe],
  ["l'administrateur", admin],
] as const) {
  test(`${libelle} voit la réservation d'un client, sans pouvoir la payer`, async ({ page }) => {
    await seConnecter(page, compte.email);
    await ouvrir(page, `/reservations/${reservationId}`);

    await expect(contenu(page).getByText(clientA.nom)).toBeVisible();
    await expect(contenu(page).getByText(clientA.email)).toBeVisible();
    await expect(page.getByRole("button", { name: /Payer/ })).toHaveCount(0);
    await expect(
      page.getByText("Seul le client titulaire de cette réservation peut la payer."),
    ).toBeVisible();

    // Les réservations d'avant les comptes restent consultables par le personnel.
    await ouvrir(page, "/reservations/demo-r3-horizon");
    await expect(contenu(page).getByText(EMAIL_DEMO)).toBeVisible();
  });
}
