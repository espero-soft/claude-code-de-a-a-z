// Contrôle de démarrage du serveur (src/instrumentation.ts), pur et testé.
import { type Environnement, verifierConfiguration } from "@/lib/configuration";

// Phase posée par Next pendant `next build` (constante PHASE_PRODUCTION_BUILD).
const PHASE_BUILD = "phase-production-build";

// Texte d'erreur à afficher avant de refuser le démarrage, ou null si le
// serveur peut démarrer. Vérifie seulement un serveur de production en
// fonctionnement : pas le développement, pas le build, pas le runtime Edge.
export function erreurConfiguration(env: Environnement): string | null {
  if (env.NODE_ENV !== "production") return null;
  if (env.NEXT_PHASE === PHASE_BUILD) return null;
  if (env.NEXT_RUNTIME && env.NEXT_RUNTIME !== "nodejs") return null;

  const problemes = verifierConfiguration(env);
  if (problemes.length === 0) return null;
  return [
    "Réunéa ne démarre pas : configuration de production à corriger (/etc/reunea/reunea.env, voir deploiement/reunea.env.example).",
    ...problemes.map((probleme) => `  - ${probleme}`),
  ].join("\n");
}
