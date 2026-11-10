// Page « Mon profil » (/profil) : on y arrive par la navigation ; Paul change
// son nom, voit ses deux appareils connectés et déconnecte l'autre (qui perd
// sa session), puis supprime son compte avec un nouveau code reçu par e-mail.
// Après la suppression : plus de compte ni de session, la réservation payée
// reste anonymisée, celle jamais payée a disparu.
// La règle du dernier administrateur est prouvée sur une vraie base par
// src/lib/suppression-compte.test.ts : dev.db a son propre administrateur,
// l'administrateur de test n'y est jamais le dernier.
// Prérequis : `npm run db:seed`, Mailpit lancé (codes par e-mail).
// Données : e2e/profil-exemple.ts, supprimées par e2e/nettoyage.ts.
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { COMPTES_ROLES, PAUL } from "./roles-exemple";
import { nettoyer, seConnecter } from "./session";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

type Ids = { payee: string; jamaisPayee: string };
let ids: Ids;

test.beforeAll(() => {
  nettoyer();
  execFileSync("npx", ["tsx", "e2e/creer-compte.ts", COMPTES_ROLES.employe.email, "EMPLOYE"]);
  ids = JSON.parse(execFileSync("npx", ["tsx", "e2e/profil-exemple.ts", "preparer"], { encoding: "utf8" }));
});
test.afterAll(nettoyer);

const navigation = (page: Page) => page.getByRole("navigation", { name: "Navigation principale" });

function etatEnBase() {
  return JSON.parse(
    execFileSync("npx", ["tsx", "e2e/profil-exemple.ts", "etat", ids.payee, ids.jamaisPayee], {
      encoding: "utf8",
    }),
  ) as {
    compte: boolean;
    sessions: number;
    reservations: { id: string; nomClient: string; emailClient: string; utilisateurId: string | null; statut: string }[];
  };
}

// Code de suppression : le dernier e-mail reçu par Paul, dont le sujet finit
// par les 6 chiffres.
async function codeRecu(page: Page): Promise<string> {
  const recherche = encodeURIComponent(`to:"${PAUL.email}" subject:"Suppression"`);
  let code = "";
  await expect(async () => {
    const reponse = await page.request.get(`${MAILPIT}/api/v1/search?query=${recherche}&limit=1`);
    const { messages } = (await reponse.json()) as { messages: { Subject: string }[] };
    const trouve = messages[0]?.Subject.match(/(\d{6})$/);
    expect(trouve).toBeTruthy();
    code = trouve![1];
  }).toPass({ timeout: 10_000 });
  return code;
}

test("un visiteur est renvoyé vers la connexion", async ({ page }) => {
  await page.goto("/profil");
  await expect(page).toHaveURL(/\/connexion\?retour=%2Fprofil$/);
});

test("Paul change son nom et déconnecte son autre appareil", async ({ page, browser }) => {
  // Deux appareils : un autre navigateur, puis celui-ci.
  const autreContexte = await browser.newContext();
  const autrePage = await autreContexte.newPage();
  await seConnecter(autrePage, PAUL.email);
  await seConnecter(page, PAUL.email);

  await page.goto("/");
  await navigation(page).getByRole("link", { name: "Mon profil" }).click();
  await expect(page).toHaveURL(/\/profil$/);
  await expect(page).toHaveTitle("Mon profil");
  await expect(page.getByRole("heading", { level: 1, name: "Mon profil" })).toBeVisible();
  await expect(navigation(page).getByRole("link", { name: "Mon profil" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByText(PAUL.email, { exact: true })).toBeVisible();

  // Nom : enregistré, repris par l'en-tête (initiale).
  const champNom = page.getByLabel("Votre nom");
  await champNom.fill("   ");
  await page.getByRole("button", { name: "Enregistrer mon nom" }).click();
  await expect(page.getByText("Indiquez votre nom.")).toBeVisible();
  await champNom.fill(`  ${PAUL.nom} `);
  await page.getByRole("button", { name: "Enregistrer mon nom" }).click();
  await expect(page.getByText("Votre nom est enregistré.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Votre nom")).toHaveValue(PAUL.nom);

  // Appareils : celui-ci en premier, marqué ; l'autre à déconnecter.
  const appareils = page.getByRole("region", { name: "Appareils connectés" }).getByRole("listitem");
  await expect(appareils).toHaveCount(2);
  await expect(appareils.first()).toHaveAccessibleName(/, cet appareil$/);
  await expect(appareils.first().getByRole("button", { name: /Déconnecter/ })).toHaveCount(0);
  await expect(appareils.first().getByText(/^Connecté le \d{1,2} \w+ \d{4} à \d{1,2} h/)).toBeVisible();

  await appareils.nth(1).getByRole("button", { name: /^Déconnecter/ }).click();
  await expect(appareils).toHaveCount(1);

  // L'autre navigateur a perdu sa session ; celui-ci la garde.
  await autrePage.goto("/profil");
  await expect(autrePage).toHaveURL(/\/connexion\?retour=%2Fprofil$/);
  await autreContexte.close();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Mon profil" })).toBeVisible();
});

test("Paul supprime son compte avec un nouveau code e-mail ; la réservation payée reste, anonymisée", async ({
  page,
}) => {
  await seConnecter(page, PAUL.email);
  await page.goto("/profil");
  const suppression = page.getByRole("region", { name: "Supprimer mon compte" });

  // Pas de bouton de suppression avant le code.
  await expect(suppression.getByRole("button", { name: /Supprimer définitivement/ })).toHaveCount(0);
  await suppression.getByRole("button", { name: "Recevoir un code pour supprimer mon compte" }).click();
  await expect(suppression.getByText(`Nous venons d'envoyer un code à 6 chiffres à ${PAUL.email}`)).toBeVisible();
  const code = await codeRecu(page);

  // Mauvais code : rien n'est supprimé.
  const faux = code === "000000" ? "111111" : "000000";
  await suppression.getByLabel("Code reçu par e-mail").fill(faux);
  await suppression.getByRole("button", { name: "Supprimer définitivement mon compte" }).click();
  await expect(suppression.getByText(/^Code incorrect/)).toBeVisible();
  expect(etatEnBase().compte).toBe(true);

  await suppression.getByLabel("Code reçu par e-mail").fill(code);
  await suppression.getByRole("button", { name: "Supprimer définitivement mon compte" }).click();
  await expect(page).toHaveURL(/\/compte-supprime$/);
  await expect(page.getByRole("heading", { level: 1, name: "Votre compte est supprimé" })).toBeVisible();
  await expect(navigation(page).getByRole("link", { name: "Mon profil" })).toHaveCount(0);

  const etat = etatEnBase();
  expect(etat.compte).toBe(false);
  expect(etat.sessions).toBe(0);
  // Seule la réservation payée reste, sans nom, sans e-mail, sans titulaire.
  expect(etat.reservations).toEqual([
    { id: ids.payee, nomClient: "Client supprimé", emailClient: "", utilisateurId: null, statut: "CONFIRMEE" },
  ]);

  // Le cookie ne rouvre rien.
  await page.goto("/profil");
  await expect(page).toHaveURL(/\/connexion\?retour=%2Fprofil$/);
});

test("un employé doit valider son second facteur avant de supprimer son compte", async ({ page }) => {
  // Code e-mail seulement, sans le second facteur.
  await seConnecter(page, COMPTES_ROLES.employe.email);
  await page.goto("/profil");
  const suppression = page.getByRole("region", { name: "Supprimer mon compte" });
  await expect(suppression.getByText(/Validez d'abord votre second facteur/)).toBeVisible();
  await expect(suppression.getByRole("button")).toHaveCount(0);
  await expect(suppression.getByRole("link", { name: "Valider mon second facteur" })).toHaveAttribute(
    "href",
    "/double-authentification?retour=%2Fprofil",
  );
});
