// Tests navigateur (Playwright), dans e2e/. Ils tournent contre le serveur de
// développement et la base dev.db : lancer `npm run db:seed` avant, car le
// parcours R3 s'appuie sur la réservation confirmée de démonstration.
import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

// Port du serveur de développement : 3000 par défaut, ou E2E_PORT si le 3000
// est pris par un autre projet (E2E_PORT=3100 npx playwright test).
const PORT = process.env.E2E_PORT ?? "3000";
const URL_SITE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  // Les tests écrivent dans la même base : un à la fois.
  workers: 1,
  use: {
    baseURL: URL_SITE,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Réutilise `npm run dev` s'il tourne déjà, sinon le démarre.
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: URL_SITE,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
