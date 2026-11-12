// Appelée une fois au démarrage du serveur Next, avant la première requête
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
//
// En production (`next start`), refuse de démarrer si la configuration est
// incomplète ou dangereuse : Mailpit oublié, adresse en http, clé Stripe live...
// On le découvre ainsi au démarrage (journalctl -u reunea), et non au premier
// e-mail ou au premier paiement. Les messages nomment la variable, jamais sa
// valeur. Rien pendant `next build` (NEXT_PHASE) ni en développement
// (erreurConfiguration, src/lib/demarrage.ts).
// Code Node seulement : import dynamique sous NEXT_RUNTIME (même doc).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { refuserDemarrageSiMalConfigure } = await import("@/lib/demarrage-node");
    refuserDemarrageSiMalConfigure();
  }
}
