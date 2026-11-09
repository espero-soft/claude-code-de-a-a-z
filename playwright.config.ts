// Tests navigateur (Playwright), dans e2e/. Ils tournent contre le serveur de
// développement et la base dev.db : lancer `npm run db:seed` avant, car le
// parcours R3 s'appuie sur la réservation confirmée de démonstration.
import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // Les tests écrivent dans la même base : un à la fois.
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Réutilise `npm run dev` s'il tourne déjà, sinon le démarre.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
