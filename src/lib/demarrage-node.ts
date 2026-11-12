// Runtime Node.js seulement : chargé par src/instrumentation.ts sous
// NEXT_RUNTIME === "nodejs" (process.exit n'existe pas dans le runtime Edge).
import { erreurConfiguration } from "@/lib/demarrage";

// process.exit et non une exception : Next 16 garde le processus en vie après
// une erreur dans register et répond 500 partout ; systemd le croirait en marche.
export function refuserDemarrageSiMalConfigure() {
  const erreur = erreurConfiguration(process.env);
  if (erreur) {
    console.error(erreur);
    process.exit(1);
  }
}
