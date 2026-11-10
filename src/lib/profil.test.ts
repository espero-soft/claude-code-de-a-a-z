import { describe, expect, it } from "vitest";
import { decrireAppareil, listerAppareils, LONGUEUR_MAX_NOM, validerNom } from "./profil";

describe("validerNom", () => {
  it("garde le nom, sans espaces superflus", () => {
    expect(validerNom("  Claire   Dubois ")).toEqual({ ok: true, nom: "Claire Dubois" });
  });

  it.each(["", "   ", "\n\t"])("refuse un nom vide (%j)", (saisie) => {
    expect(validerNom(saisie)).toEqual({ ok: false, erreur: "Indiquez votre nom." });
  });

  it(`accepte ${LONGUEUR_MAX_NOM} caractères, pas un de plus`, () => {
    expect(validerNom("é".repeat(LONGUEUR_MAX_NOM)).ok).toBe(true);
    expect(validerNom("é".repeat(LONGUEUR_MAX_NOM + 1)).ok).toBe(false);
  });

  it("ramène un retour à la ligne collé à une espace", () => {
    expect(validerNom("Claire\nDubois")).toEqual({ ok: true, nom: "Claire Dubois" });
  });

  it.each([
    ["caractère de contrôle", "Claire\u0007"],
    ["largeur nulle", "Cla\u200bire"],
    ["inversion du sens d'écriture", "Claire\u202eesioD"],
  ])("refuse un %s", (_cas, saisie) => {
    expect(validerNom(saisie)).toEqual({
      ok: false,
      erreur: "Votre nom contient un caractère non autorisé.",
    });
  });

  it("accepte accents, tirets et apostrophes", () => {
    expect(validerNom("Zoé O'Neil-Laforêt")).toEqual({ ok: true, nom: "Zoé O'Neil-Laforêt" });
  });
});

describe("decrireAppareil", () => {
  it.each([
    [
      "Chrome sur macOS",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    ],
    [
      "Safari sur iPhone",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    ],
    [
      "Firefox sur Windows",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    ],
    [
      "Edge sur Windows",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
    ],
    [
      "Chrome sur Android",
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
    ],
    [
      "Chrome sur iPhone",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1",
    ],
    ["Firefox sur Linux", "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0"],
  ])("reconnaît %s", (attendu, userAgent) => {
    expect(decrireAppareil(userAgent)).toBe(attendu);
  });

  it.each([null, undefined, "", "curl/8.4.0"])("décrit un en-tête absent ou inconnu (%j)", (ua) => {
    expect(decrireAppareil(ua)).toBe("Appareil inconnu");
  });
});

describe("listerAppareils", () => {
  const maintenant = new Date("2026-11-10T12:00:00Z");
  const session = (id: string, actif: string, expire = "2026-11-17T12:00:00Z") => ({
    id,
    userAgent: null,
    createdAt: new Date("2026-11-01T08:00:00Z"),
    updatedAt: new Date(actif),
    expiresAt: new Date(expire),
  });

  it("met cet appareil en premier, puis du plus récent au plus ancien", () => {
    const appareils = listerAppareils(
      [
        session("ancien", "2026-11-02T08:00:00Z"),
        session("recent", "2026-11-09T08:00:00Z"),
        session("celui-ci", "2026-11-01T08:00:00Z"),
      ],
      "celui-ci",
      maintenant,
    );
    expect(appareils.map((a) => [a.id, a.courant])).toEqual([
      ["celui-ci", true],
      ["recent", false],
      ["ancien", false],
    ]);
  });

  it("n'affiche pas une session expirée", () => {
    const appareils = listerAppareils(
      [session("valable", "2026-11-09T08:00:00Z"), session("expiree", "2026-11-09T08:00:00Z", "2026-11-10T12:00:00Z")],
      "valable",
      maintenant,
    );
    expect(appareils.map((a) => a.id)).toEqual(["valable"]);
  });

  it("n'expose que l'identifiant de session, jamais d'autre champ", () => {
    const [appareil] = listerAppareils(
      [{ ...session("s1", "2026-11-09T08:00:00Z"), token: "secret" } as never],
      "s1",
      maintenant,
    );
    expect(Object.keys(appareil).sort()).toEqual(["actifLe", "connecteLe", "courant", "id", "libelle"]);
  });
});
