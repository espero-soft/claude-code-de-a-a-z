import { describe, expect, it } from "vitest";
import {
  adressePublique,
  modeTls,
  optionsSmtp,
  reservationDemoAutorisee,
  verifierConfiguration,
} from "./configuration";
import { cleStripeFactice } from "./cles-factices";

// Configuration complète et valable d'un serveur de production (valeurs factices).
const PRODUCTION = {
  NODE_ENV: "production",
  DATABASE_URL: "file:/var/lib/reunea/reunea.db",
  BETTER_AUTH_SECRET: "x".repeat(44),
  BETTER_AUTH_URL: "https://reservations.exemple.fr",
  SMTP_HOST: "smtp.exemple.fr",
  SMTP_PORT: "587",
  SMTP_UTILISATEUR: "identifiant",
  SMTP_MOT_DE_PASSE: "cle-smtp-tres-secrete",
  COURRIEL_EXPEDITEUR: "Réunéa <ne-pas-repondre@exemple.fr>",
  STRIPE_SECRET_KEY: cleStripeFactice("rk", "test"),
};

describe("adressePublique", () => {
  it("renvoie l'origine, sans chemin ni barre finale", () => {
    expect(adressePublique({ BETTER_AUTH_URL: "https://reservations.exemple.fr/" })).toBe(
      "https://reservations.exemple.fr",
    );
    expect(adressePublique({ BETTER_AUTH_URL: " http://localhost:3000/chemin " })).toBe(
      "http://localhost:3000",
    );
  });

  it.each([undefined, "", "pas une adresse", "ftp://exemple.fr", "javascript:alert(1)"])(
    "refuse %s",
    (valeur) => {
      expect(() => adressePublique({ BETTER_AUTH_URL: valeur })).toThrow(/BETTER_AUTH_URL/);
    },
  );
});

describe("reservationDemoAutorisee", () => {
  it("l'autorise sur le poste de développement", () => {
    expect(reservationDemoAutorisee({ BETTER_AUTH_URL: "http://localhost:3000" })).toBe(true);
    expect(reservationDemoAutorisee({})).toBe(true);
  });

  it("la refuse avec NODE_ENV=production", () => {
    expect(
      reservationDemoAutorisee({ NODE_ENV: "production", BETTER_AUTH_URL: "http://localhost:3000" }),
    ).toBe(false);
  });

  it("la refuse sur le serveur même sans NODE_ENV (adresse publique en https)", () => {
    expect(reservationDemoAutorisee({ BETTER_AUTH_URL: "https://reservations.exemple.fr" })).toBe(
      false,
    );
  });
});

describe("modeTls et optionsSmtp", () => {
  it("garde Mailpit sans TLS ni authentification par défaut", () => {
    expect(optionsSmtp({})).toEqual({
      host: "localhost",
      port: 1025,
      secure: false,
      requireTLS: false,
      auth: undefined,
    });
    expect(optionsSmtp({ SMTP_HOST: "localhost", SMTP_PORT: "1025" }).requireTLS).toBe(false);
  });

  it("exige STARTTLS sur un vrai serveur (port 587 par défaut)", () => {
    expect(optionsSmtp({ SMTP_HOST: "smtp.exemple.fr", SMTP_UTILISATEUR: "u", SMTP_MOT_DE_PASSE: "p" })).toEqual({
      host: "smtp.exemple.fr",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: "u", pass: "p" },
    });
  });

  it("passe en TLS implicite sur le port 465", () => {
    const options = optionsSmtp({ SMTP_HOST: "smtp.exemple.fr", SMTP_PORT: "465" });
    expect(options).toMatchObject({ port: 465, secure: true, requireTLS: false });
  });

  it("suit SMTP_TLS quand il est renseigné", () => {
    expect(modeTls({ SMTP_HOST: "localhost", SMTP_TLS: "starttls" })).toBe("starttls");
    expect(modeTls({ SMTP_HOST: "smtp.exemple.fr", SMTP_TLS: "Implicite" })).toBe("implicite");
    expect(() => modeTls({ SMTP_TLS: "oui" })).toThrow(/SMTP_TLS/);
  });

  it("refuse un port invalide", () => {
    expect(() => optionsSmtp({ SMTP_HOST: "smtp.exemple.fr", SMTP_PORT: "abc" })).toThrow(/SMTP_PORT/);
  });
});

describe("verifierConfiguration", () => {
  it("accepte une configuration de production complète", () => {
    expect(verifierConfiguration(PRODUCTION)).toEqual([]);
    expect(verifierConfiguration({ ...PRODUCTION, STRIPE_SECRET_KEY: cleStripeFactice("sk", "test") })).toEqual([]);
  });

  it("signale chaque variable manquante, par son nom", () => {
    const problemes = verifierConfiguration({ NODE_ENV: "production" });
    for (const nom of [
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "SMTP_HOST",
      "SMTP_UTILISATEUR",
      "SMTP_MOT_DE_PASSE",
      "COURRIEL_EXPEDITEUR",
      "STRIPE_SECRET_KEY",
    ]) {
      expect(problemes.some((probleme) => probleme.startsWith(nom))).toBe(true);
    }
  });

  it.each([
    ["DATABASE_URL", { DATABASE_URL: "postgres://base" }],
    ["BETTER_AUTH_SECRET", { BETTER_AUTH_SECRET: "trop-court" }],
    ["BETTER_AUTH_URL", { BETTER_AUTH_URL: "http://reservations.exemple.fr" }],
    ["BETTER_AUTH_URL", { BETTER_AUTH_URL: "https://localhost:3000" }],
    ["SMTP_HOST", { SMTP_HOST: "localhost" }],
    ["SMTP_TLS", { SMTP_TLS: "aucun" }],
    ["SMTP_TLS", { SMTP_TLS: "peut-etre" }],
    ["SMTP_PORT", { SMTP_PORT: "99999" }],
    ["COURRIEL_EXPEDITEUR", { COURRIEL_EXPEDITEUR: "Réunéa <ne-pas-repondre@reunea.test>" }],
    ["STRIPE_SECRET_KEY", { STRIPE_SECRET_KEY: cleStripeFactice("sk", "live") }],
    ["STRIPE_SECRET_KEY", { STRIPE_SECRET_KEY: cleStripeFactice("rk", "live") }],
  ])("refuse une valeur inadaptée de %s", (nom, changement) => {
    const problemes = verifierConfiguration({ ...PRODUCTION, ...changement });
    expect(problemes).toHaveLength(1);
    expect(problemes[0].startsWith(nom)).toBe(true);
  });

  it("ne recopie jamais la valeur d'une variable dans ses messages", () => {
    const secrets = {
      ...PRODUCTION,
      BETTER_AUTH_SECRET: "secret-court-123",
      SMTP_MOT_DE_PASSE: "",
      STRIPE_SECRET_KEY: cleStripeFactice("sk", "live", "FacticeValeurSecrete"),
      DATABASE_URL: "postgres://utilisateur:motdepasse@hote/base",
    };
    const texte = verifierConfiguration(secrets).join("\n");
    expect(texte).not.toContain("secret-court-123");
    expect(texte).not.toContain("FacticeValeurSecrete");
    expect(texte).not.toContain("motdepasse");
  });
});
