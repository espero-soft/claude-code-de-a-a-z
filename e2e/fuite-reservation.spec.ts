// Fuite de données personnelles sur /reservations/[id] (SECURITE.md, sections 1
// et 3) : un visiteur sans compte qui connaît le lien d'une réservation ne doit
// voir ni le nom ni l'e-mail du client.
// S'appuie sur la réservation CONFIRMÉE de démonstration du seed
// (id « demo-r3-horizon ») : lancer `npm run db:seed` avant.
import { expect, test } from "@playwright/test";

const NOM_DEMO = "Client de démonstration";
const EMAIL_DEMO = "demo@example.com";

test("un visiteur sans compte ne voit pas le nom ni l'e-mail du client", async ({ page }) => {
  // ÉCHEC ATTENDU : la fuite existe encore (SECURITE.md, section 1, ligne
  // « /reservations/[id] » ; correction prévue à l'étape 4 du plan, section 7).
  // Le jour où la page sera protégée, ce test passera et Playwright le
  // signalera en erreur (« expected to fail ») : retirer alors cette ligne.
  test.fail();

  await page.goto("/reservations/demo-r3-horizon");

  // La page arrive en flux (Suspense) : attendre la fin du rendu avant de
  // conclure à l'absence, sinon le test passerait avant l'arrivée des données.
  await page.waitForLoadState("networkidle");

  await expect(page.getByText(NOM_DEMO)).toHaveCount(0);
  await expect(page.getByText(EMAIL_DEMO)).toHaveCount(0);
});
