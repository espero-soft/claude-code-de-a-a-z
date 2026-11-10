import { describe, expect, it } from "vitest";
import {
  cheminDeRetour,
  erreurCode,
  erreurEmail,
  initialeCompte,
  messageErreurConnexion,
  normaliserCode,
} from "./connexion";

describe("erreurEmail", () => {
  it("accepte une adresse valide, espaces autour compris", () => {
    expect(erreurEmail("  claire@exemple.fr ")).toBeNull();
  });

  it("demande une adresse quand le champ est vide", () => {
    expect(erreurEmail("   ")).toBe("Saisissez votre adresse e-mail.");
  });

  it.each(["claire", "claire@", "claire@exemple", "cla ire@exemple.fr"])(
    "refuse « %s »",
    (email) => {
      expect(erreurEmail(email)).toMatch(/^Adresse e-mail invalide/);
    },
  );
});

describe("erreurCode", () => {
  it("accepte 6 chiffres, même collés avec des espaces", () => {
    expect(erreurCode("123456")).toBeNull();
    expect(erreurCode(" 123 456 ")).toBeNull();
    expect(normaliserCode(" 123 456 ")).toBe("123456");
  });

  it("demande le code quand le champ est vide", () => {
    expect(erreurCode("")).toBe("Saisissez le code à 6 chiffres reçu par e-mail.");
  });

  it.each(["12345", "1234567", "12345a"])("refuse « %s »", (code) => {
    expect(erreurCode(code)).toBe("Le code contient exactement 6 chiffres.");
  });
});

describe("messageErreurConnexion", () => {
  it("place un code incorrect sous le champ du code", () => {
    expect(messageErreurConnexion({ status: 400, code: "INVALID_OTP" })).toEqual({
      champ: "code",
      message: "Code incorrect. Vérifiez les 6 chiffres du dernier e-mail reçu.",
    });
  });

  it("demande un nouveau code quand il a expiré ou après trop d'essais", () => {
    expect(messageErreurConnexion({ status: 400, code: "OTP_EXPIRED" })).toMatchObject({
      champ: "code",
      nouveauCodeNecessaire: true,
    });
    expect(messageErreurConnexion({ status: 403, code: "TOO_MANY_ATTEMPTS" })).toMatchObject({
      champ: "code",
      nouveauCodeNecessaire: true,
    });
  });

  it("place une adresse refusée sous le champ e-mail", () => {
    expect(messageErreurConnexion({ status: 400, code: "INVALID_EMAIL" }).champ).toBe("email");
  });

  it("explique la limitation de débit (429)", () => {
    expect(messageErreurConnexion({ status: 429 })).toEqual({
      champ: "general",
      message: "Trop de demandes en peu de temps. Patientez une minute, puis réessayez.",
    });
  });

  it("ne montre jamais un message anglais de la bibliothèque", () => {
    for (const erreur of [null, { status: 500 }, { status: 403, code: "INVALID_ORIGIN" }]) {
      const { champ, message } = messageErreurConnexion(erreur);
      expect(champ).toBe("general");
      expect(message).toMatch(/^La connexion n'a pas abouti/);
    }
  });
});

describe("cheminDeRetour", () => {
  it("garde un chemin du site", () => {
    expect(cheminDeRetour("/salles/abc/reserver")).toBe("/salles/abc/reserver");
    expect(cheminDeRetour("/aide?x=1")).toBe("/aide?x=1");
  });

  it.each([
    undefined,
    ["/a", "/b"],
    "",
    "https://autre.site",
    "//autre.site",
    "/\\autre.site",
    "salles",
    "/connexion",
    "/connexion?retour=/aide",
  ])("revient à l'accueil pour %j", (valeur) => {
    expect(cheminDeRetour(valeur)).toBe("/");
  });
});

describe("initialeCompte", () => {
  it("prend l'initiale du nom s'il existe", () => {
    expect(initialeCompte("élodie Martin", "x@exemple.fr")).toBe("É");
  });

  it("prend celle de l'e-mail quand le nom est vide", () => {
    expect(initialeCompte("", "claire@exemple.fr")).toBe("C");
  });
});
