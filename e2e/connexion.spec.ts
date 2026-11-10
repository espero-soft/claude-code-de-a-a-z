// Connexion sans mot de passe : depuis « Se connecter » dans l'en-tête, on
// saisit son e-mail, on lit le code reçu dans Mailpit, on le saisit ; l'en-tête
// affiche alors l'initiale du compte et « Se déconnecter ». Sur ordinateur et
// sur mobile (menu déroulant).
// Prérequis : `npm run db:seed`, et Mailpit lancé (SMTP sur le port 1025, API
// sur http://localhost:8025, ou MAILPIT_URL). Le compte de test
// (playwright@example.com) est supprimé avant et après par e2e/nettoyage.ts.
import { execFileSync } from "node:child_process";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const EMAIL_TEST = "playwright@example.com"; // voir e2e/nettoyage.ts
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const RECHERCHE = `to:${EMAIL_TEST}`;

function nettoyer() {
  execFileSync("npx", ["tsx", "e2e/nettoyage.ts"], { stdio: "inherit" });
}
test.beforeAll(nettoyer);
test.afterAll(nettoyer);

// Vide la boîte de test dans Mailpit, pour ne lire que le code de ce test.
test.beforeEach(async ({ request }) => {
  await request.delete(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(RECHERCHE)}`);
});

// Le code figure dans le sujet : « Votre code de connexion Réunéa : 123456 ».
// L'e-mail part sans être attendu par le serveur : on patiente un peu.
async function lireCode(request: APIRequestContext): Promise<string> {
  let code = "";
  await expect(async () => {
    const reponse = await request.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(RECHERCHE)}&limit=1`,
    );
    const { messages } = (await reponse.json()) as { messages: { Subject: string }[] };
    const trouve = messages[0]?.Subject.match(/(\d{6})$/);
    expect(trouve).toBeTruthy();
    code = trouve![1];
  }).toPass({ timeout: 10_000 });
  return code;
}

async function demanderCode(page: Page) {
  await expect(page).toHaveURL(/\/connexion/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Bienvenue chez Réunéa" }),
  ).toBeVisible();

  // Champ vide : message en français, sans appel au serveur.
  await page.getByRole("button", { name: "Recevoir mon code" }).click();
  await expect(page.getByText("Saisissez votre adresse e-mail.")).toBeVisible();

  await page.getByLabel("Adresse e-mail").fill(EMAIL_TEST);
  await page.getByRole("button", { name: "Recevoir mon code" }).click();
  await expect(page.getByRole("heading", { name: "Saisissez votre code" })).toBeVisible();
  await expect(page.getByText(EMAIL_TEST)).toBeVisible();
}

test("se connecte par code e-mail et se déconnecte, sur ordinateur", async ({
  page,
  request,
}) => {
  await page.goto("/aide");
  const navigation = page.getByRole("navigation", { name: "Navigation principale" });
  await navigation.getByRole("link", { name: "Se connecter" }).click();
  await demanderCode(page);
  await expect(navigation.getByRole("link", { name: "Se connecter" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  const code = await lireCode(request);

  // Un mauvais code est refusé, avec un message en français.
  const mauvais = `${(Number(code[0]) + 1) % 10}${code.slice(1)}`;
  await page.getByLabel("Code à 6 chiffres").fill(mauvais);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(
    page.getByText("Code incorrect. Vérifiez les 6 chiffres du dernier e-mail reçu."),
  ).toBeVisible();

  // Le bon code connecte et ramène à la page de départ (?retour=/aide).
  await page.getByLabel("Code à 6 chiffres").fill(code);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/aide$/);
  const enTete = page.getByRole("banner");
  await expect(enTete.getByText("P", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(enTete.getByText(`Connecté : ${EMAIL_TEST}`).filter({ visible: true })).toHaveCount(1);
  await expect(navigation.getByRole("link", { name: "Se connecter" })).toHaveCount(0);

  // Déjà connecté : /connexion renvoie vers la page demandée.
  await page.goto("/connexion?retour=/salles");
  await expect(page).toHaveURL(/\/salles$/);

  await navigation.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(navigation.getByRole("link", { name: "Se connecter" })).toBeVisible();
  await expect(enTete.getByText("P", { exact: true }).filter({ visible: true })).toHaveCount(0);
});

test("se connecte et se déconnecte par le menu, sur mobile", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const enTete = page.getByRole("banner");
  await enTete.getByRole("link", { name: "Se connecter" }).click();
  await demanderCode(page);

  await page.getByLabel("Code à 6 chiffres").fill(await lireCode(request));
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(enTete.getByText("P", { exact: true }).filter({ visible: true })).toBeVisible();

  // Sur mobile, « Se déconnecter » est dans le menu, avec l'adresse du compte.
  await enTete.getByRole("button", { name: "Menu" }).click();
  const menu = enTete.getByRole("navigation", { name: "Navigation principale" }).getByRole("list");
  await expect(menu.getByText(`Connecté : ${EMAIL_TEST}`)).toBeVisible();
  await menu.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(enTete.getByRole("link", { name: "Se connecter" })).toBeVisible();
});
