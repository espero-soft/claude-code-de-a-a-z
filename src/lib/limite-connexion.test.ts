import { describe, expect, it } from "vitest";
import {
  cleLimite,
  deciderLimite,
  LIMITE_ENVOIS,
  LIMITE_ESSAIS,
  type Compteur,
} from "./limite-connexion";

const REGLE = { max: 3, fenetreMs: 15 * 60_000 };
const DEBUT = new Date("2026-11-10T10:00:00Z");
const apres = (minutes: number) => new Date(DEBUT.getTime() + minutes * 60_000);

describe("deciderLimite", () => {
  it("autorise la première demande et ouvre une fenêtre", () => {
    expect(deciderLimite(null, REGLE, DEBUT)).toEqual({
      autorise: true,
      suivant: { nombre: 1, debut: DEBUT },
    });
  });

  it("compte les demandes suivantes dans la même fenêtre", () => {
    const compteur: Compteur = { nombre: 2, debut: DEBUT };
    expect(deciderLimite(compteur, REGLE, apres(5))).toEqual({
      autorise: true,
      suivant: { nombre: 3, debut: DEBUT },
    });
  });

  it("refuse au-delà du maximum, avec le délai restant", () => {
    const compteur: Compteur = { nombre: 3, debut: DEBUT };
    expect(deciderLimite(compteur, REGLE, apres(5))).toEqual({
      autorise: false,
      reessayerDansSecondes: 10 * 60,
    });
  });

  it("arrondit le délai restant à la seconde supérieure", () => {
    const compteur: Compteur = { nombre: 3, debut: DEBUT };
    const presqueFin = new Date(DEBUT.getTime() + REGLE.fenetreMs - 1);
    expect(deciderLimite(compteur, REGLE, presqueFin)).toEqual({
      autorise: false,
      reessayerDansSecondes: 1,
    });
  });

  it("rouvre une fenêtre pile à son expiration", () => {
    const compteur: Compteur = { nombre: 3, debut: DEBUT };
    expect(deciderLimite(compteur, REGLE, apres(15))).toEqual({
      autorise: true,
      suivant: { nombre: 1, debut: apres(15) },
    });
  });
});

describe("cleLimite", () => {
  it("ne distingue ni la casse ni les espaces autour de l'adresse", () => {
    expect(cleLimite("envoi", "  Victime@Exemple.FR ")).toBe("envoi:victime@exemple.fr");
  });

  it("sépare les envois et les essais", () => {
    expect(cleLimite("essai", "a@b.fr")).not.toBe(cleLimite("envoi", "a@b.fr"));
  });
});

describe("règles retenues", () => {
  it("laisse demander un code puis le renvoyer deux fois", () => {
    expect(LIMITE_ENVOIS.max).toBe(3);
  });

  // Force brute sur un compte : au plus LIMITE_ESSAIS.max essais par fenêtre,
  // tous codes confondus. Sur une journée, moins de 1 chance sur 4 000.
  it("borne la force brute à moins de 1 chance sur 4 000 par jour", () => {
    const essaisParJour = LIMITE_ESSAIS.max * ((24 * 60 * 60_000) / LIMITE_ESSAIS.fenetreMs);
    expect(essaisParJour / 1_000_000).toBeLessThan(1 / 4000);
  });
});
