import { describe, expect, it } from "vitest";
import { erreurConfiguration } from "./demarrage";

const INCOMPLETE = { NODE_ENV: "production", NEXT_RUNTIME: "nodejs", SMTP_MOT_DE_PASSE: "cle-secrete" };

describe("erreurConfiguration", () => {
  it("refuse de démarrer un serveur de production mal configuré, en listant les variables", () => {
    const erreur = erreurConfiguration(INCOMPLETE);
    expect(erreur).toMatch(/^Réunéa ne démarre pas/);
    expect(erreur).toContain("  - BETTER_AUTH_URL manque.");
    expect(erreur).toContain("  - SMTP_HOST manque");
    expect(erreur).not.toContain("cle-secrete");
  });

  it("ne vérifie rien en développement ni pendant le build", () => {
    expect(erreurConfiguration({ ...INCOMPLETE, NODE_ENV: "development" })).toBeNull();
    expect(erreurConfiguration({ ...INCOMPLETE, NEXT_PHASE: "phase-production-build" })).toBeNull();
  });

  it("ne vérifie rien dans le runtime Edge", () => {
    expect(erreurConfiguration({ ...INCOMPLETE, NEXT_RUNTIME: "edge" })).toBeNull();
  });

  it("laisse démarrer une production complète", () => {
    expect(
      erreurConfiguration({
        NODE_ENV: "production",
        NEXT_RUNTIME: "nodejs",
        DATABASE_URL: "file:/var/lib/reunea/reunea.db",
        BETTER_AUTH_SECRET: "x".repeat(44),
        BETTER_AUTH_URL: "https://reservations.exemple.fr",
        SMTP_HOST: "smtp.exemple.fr",
        SMTP_UTILISATEUR: "identifiant",
        SMTP_MOT_DE_PASSE: "cle",
        COURRIEL_EXPEDITEUR: "Réunéa <ne-pas-repondre@exemple.fr>",
        STRIPE_SECRET_KEY: "rk_test_abc",
      }),
    ).toBeNull();
  });
});
