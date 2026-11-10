import { describe, expect, it } from "vitest";
import {
  erreurCodeSecours,
  erreurCodeTotp,
  grouperSecret,
  messageDeuxiemeFacteur,
  normaliserCodeSecours,
  normaliserCodeTotp,
  secretDepuisUri,
} from "./deuxieme-facteur";

describe("code de l'application", () => {
  it("accepte 6 chiffres, espaces ignorés", () => {
    expect(normaliserCodeTotp(" 123 456 ")).toBe("123456");
    expect(erreurCodeTotp("123456")).toBeNull();
  });

  it("refuse une saisie vide ou qui n'a pas 6 chiffres", () => {
    expect(erreurCodeTotp("")).toBe("Saisissez le code à 6 chiffres affiché par l'application.");
    for (const code of ["12345", "1234567", "12345a"]) {
      expect(erreurCodeTotp(code)).toBe("Le code compte exactement 6 chiffres.");
    }
  });
});

describe("code de secours", () => {
  it("remet le tiret oublié et garde la casse", () => {
    expect(normaliserCodeSecours(" AbCd123xYz ")).toBe("AbCd1-23xYz");
    expect(normaliserCodeSecours("AbCd1-23xYz")).toBe("AbCd1-23xYz");
    expect(erreurCodeSecours("AbCd1-23xYz")).toBeNull();
  });

  it("refuse une forme inattendue", () => {
    expect(erreurCodeSecours("")).toBe("Saisissez l'un de vos codes de secours.");
    expect(erreurCodeSecours("abc-def")).toBe("Un code de secours a la forme AbCd1-23xYz (10 caractères).");
  });
});

describe("secret affiché", () => {
  it("lit le secret de l'URI otpauth:// et le groupe par 4", () => {
    const uri = "otpauth://totp/R%C3%A9un%C3%A9a:claire%40exemple.fr?secret=JBSWY3DPEHPK3PXP&issuer=R%C3%A9un%C3%A9a";
    expect(secretDepuisUri(uri)).toBe("JBSWY3DPEHPK3PXP");
    expect(grouperSecret("JBSWY3DPEHPK3PXPQ")).toBe("JBSW Y3DP EHPK 3PXP Q");
  });

  it("refuse une adresse qui n'est pas otpauth://", () => {
    expect(secretDepuisUri("https://exemple.fr/?secret=ABC")).toBeNull();
    expect(secretDepuisUri("pas une adresse")).toBeNull();
  });
});

describe("messageDeuxiemeFacteur", () => {
  it("traduit les refus en disant quoi faire", () => {
    expect(messageDeuxiemeFacteur({ code: "INVALID_CODE" })).toMatch(/^Code incorrect/);
    expect(messageDeuxiemeFacteur({ code: "INVALID_BACKUP_CODE" })).toMatch(/ne sert qu'une fois/);
    expect(messageDeuxiemeFacteur({ code: "CODE_DEJA_UTILISE" })).toMatch(/Attendez le suivant/);
    expect(
      messageDeuxiemeFacteur({ code: "TROP_D_ESSAIS_DE_DEUXIEME_FACTEUR", reessayerDansSecondes: 600 }),
    ).toBe("Trop d'essais pour ce compte. Par sécurité, réessayez dans 10 minutes.");
  });

  it("garde un message générique pour l'inconnu", () => {
    expect(messageDeuxiemeFacteur(null)).toBe(
      "La vérification n'a pas abouti. Réessayez dans quelques instants.",
    );
  });
});
