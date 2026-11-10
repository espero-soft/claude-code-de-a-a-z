// Redirection ouverte par ?retour= après la connexion : un lien piégé
// (/connexion?retour=/%09/exemple.com) ne doit jamais envoyer le visiteur sur
// un autre site. Le navigateur retire tabulations et sauts de ligne d'une
// adresse : « /\t/exemple.com » deviendrait « //exemple.com », un autre hôte.
// Deux chemins sont essayés : la redirection du serveur (compte déjà
// connecté) et celle du navigateur juste après la saisie du code.
// Toute requête vers un hôte autre que localhost est interceptée et notée.
// Prérequis : Mailpit lancé (voir e2e/session.ts).
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { nettoyer, seConnecter } from "./session";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

// Valeurs telles qu'écrites dans l'adresse du lien piégé.
const PIEGES = [
  "/%09/exemple.com",
  "/%0A/exemple.com",
  "/%0D/exemple.com",
  "/%09%0A/exemple.com",
  "%09//exemple.com",
  "/%5C/exemple.com",
  "https:%2F%2Fexemple.com",
];

test.beforeAll(nettoyer);
test.afterAll(nettoyer);

// Adresse jetable par cas (domaine nettoyé par e2e/nettoyage.ts), pour ne
// pas cumuler les envois de code sur une même adresse.
function adresse(prefixe: string, index: number) {
  return `${prefixe}-${index}@attaque.example.com`;
}

// Note tout départ vers un autre hôte, et répond une page vide à sa place.
async function surveillerSorties(context: BrowserContext): Promise<string[]> {
  const sorties: string[] = [];
  await context.route(
    (url) => url.hostname !== "localhost",
    async (route) => {
      sorties.push(route.request().url());
      await route.fulfill({ status: 200, contentType: "text/html", body: "PIEGE" });
    },
  );
  return sorties;
}

async function attendreStable(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
}

PIEGES.forEach((piege, index) => {
  test(`compte connecté : ?retour=${piege} reste sur le site`, async ({ page, context }) => {
    const sorties = await surveillerSorties(context);
    await seConnecter(page, adresse("serveur", index));

    await page.goto(`/connexion?retour=${piege}`);
    await attendreStable(page);

    expect(sorties).toEqual([]);
    expect(new URL(page.url()).hostname).toBe("localhost");
  });

  test(`après la saisie du code : ?retour=${piege} reste sur le site`, async ({
    page,
    context,
  }) => {
    const sorties = await surveillerSorties(context);
    const email = adresse("client", index);
    const recherche = encodeURIComponent(`to:"${email}"`);
    await context.request.delete(`${MAILPIT}/api/v1/search?query=${recherche}`);

    await page.goto(`/connexion?retour=${piege}`);
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByRole("button", { name: "Recevoir mon code" }).click();
    await expect(page.getByRole("heading", { name: "Saisissez votre code" })).toBeVisible();

    let code = "";
    await expect(async () => {
      const reponse = await context.request.get(
        `${MAILPIT}/api/v1/search?query=${recherche}&limit=1`,
      );
      const { messages } = (await reponse.json()) as { messages: { Subject: string }[] };
      const trouve = messages[0]?.Subject.match(/(\d{6})$/);
      expect(trouve).toBeTruthy();
      code = trouve![1];
    }).toPass({ timeout: 10_000 });

    await page.getByLabel("Code à 6 chiffres").fill(code);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).not.toHaveURL(/\/connexion/);
    await attendreStable(page);

    expect(sorties).toEqual([]);
    expect(new URL(page.url()).hostname).toBe("localhost");
  });
});

// Témoin : un vrai chemin du site est bien suivi.
test("un chemin du site est suivi après la connexion", async ({ page }) => {
  await seConnecter(page, adresse("temoin", 0));
  await page.goto("/connexion?retour=%2Faide");
  await expect(page).toHaveURL(/\/aide$/);
});
