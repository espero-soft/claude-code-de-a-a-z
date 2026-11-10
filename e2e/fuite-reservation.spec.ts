// Fuite de données personnelles sur /reservations/[id] (SECURITE.md, sections 1
// et 3), corrigée au module 12 : seul le titulaire, un employé ou
// l'administrateur voit une réservation. Pour tous les autres, la réponse est
// celle d'une réservation inexistante (on ne confirme pas qu'elle existe).
// Prérequis : `npm run db:seed` (réservation de démonstration
// « demo-r3-horizon ») et Mailpit lancé (connexion par code).
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { COMPTES_ROLES } from "./roles-exemple";
import { nettoyer, seConnecter, seConnecterPersonnel } from "./session";

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

// Titre de l'onglet tel que le serveur l'envoie, avant tout JavaScript :
// c'est ce qu'affiche le navigateur à l'arrivée sur la page. Le premier
// <title> du document est celui que retient l'onglet.
function titreEnvoye(html: string): string | undefined {
  return html.match(/<title>([^<]*)<\/title>/)?.[1];
}

// Ce que voit la personne : code HTTP, titre de l'onglet (envoyé par le
// serveur, puis après rendu complet) et texte de toute la page.
async function rendu(page: Page, chemin: string) {
  const reponse = await ouvrir(page, chemin);
  return {
    status: reponse?.status(),
    titreEnvoye: titreEnvoye((await reponse?.text()) ?? ""),
    titre: await page.title(),
    texte: await page.locator("body").innerText(),
  };
}

// Navigation interne (sans recharger la page, comme un clic sur un lien
// Next) : le titre est alors mis à jour par le JavaScript du navigateur,
// après un court instant sans titre : on l'attend, on ne le lit pas une fois.
async function rendreParNavigationInterne(page: Page, chemin: string, titreAttendu: string) {
  await ouvrir(page, "/salles");
  await page.evaluate((url) => {
    (window as unknown as { next: { router: { push(url: string): void } } }).next.router.push(url);
  }, chemin);
  await page.waitForURL(`**${chemin}`);
  await expect(page).toHaveTitle(titreAttendu);
  // getByRole ignore la page précédente, que Next garde cachée en mémoire.
  return page.getByRole("main").innerText();
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
  // Le titre de l'onglet ne trahit rien, dès l'arrivée sur la page : celui
  // de la page introuvable, pas « Votre réservation ».
  expect(autre.titreEnvoye).toBe("Page introuvable");
  expect(autre.titre).toBe("Page introuvable");
  // Page introuvable en français, au design Réunéa (pas celle de Next).
  await expect(page.getByRole("heading", { level: 1, name: "Page introuvable" })).toBeVisible();
  await expect(page.getByText("This page could not be found")).toHaveCount(0);

  // Même chose en arrivant par une navigation interne.
  const autreInterne = await rendreParNavigationInterne(
    page,
    `/reservations/${reservationId}`,
    "Page introuvable",
  );
  const inexistanteInterne = await rendreParNavigationInterne(
    page,
    "/reservations/inexistante",
    "Page introuvable",
  );
  expect(autreInterne).toEqual(inexistanteInterne);

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
  const { titreEnvoye: titre } = await rendu(page, `/reservations/${reservationId}`);
  expect(titre).toBe("Votre réservation");
  await expect(page).toHaveTitle("Votre réservation");

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
    await seConnecterPersonnel(page, compte.email);
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
