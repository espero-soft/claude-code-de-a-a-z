import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// Vitest ne lit pas les "paths" de tsconfig.json : on redéclare ici l'alias
// "@/*" -> "./src/*" pour que les tests puissent importer comme l'application.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // e2e/ contient les tests navigateur, lancés par Playwright (npm run test:e2e).
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
