import { describe, expect, it } from "vitest";
import { formaterDuree, formaterHeure, formaterPlage, formaterPrix } from "./format";

// Intl place des espaces insécables (fine avant €, normale entre milliers) :
// on les ramène à des espaces simples pour comparer.
const lisible = (texte: string) => texte.replace(/[\u00a0\u202f]/g, " ");

describe("formaterPrix", () => {
  it("affiche toujours deux décimales", () => {
    expect(lisible(formaterPrix(2500))).toBe("25,00 €");
    expect(lisible(formaterPrix(7550))).toBe("75,50 €");
  });

  it("sépare les milliers", () => {
    expect(lisible(formaterPrix(120000))).toBe("1 200,00 €");
  });

  it("garde les centimes", () => {
    expect(lisible(formaterPrix(5))).toBe("0,05 €");
  });
});

// Heures du centre, Europe/Paris : 13 h UTC en novembre = 14 h à Paris.
describe("formaterHeure, formaterPlage, formaterDuree", () => {
  it("écrit l'heure de Paris sans les minutes nulles", () => {
    expect(formaterHeure(new Date("2026-11-10T13:00:00Z"))).toBe("14 h");
    expect(formaterHeure(new Date("2026-11-10T07:00:00Z"))).toBe("8 h");
    expect(formaterHeure(new Date("2026-11-10T14:30:00Z"))).toBe("15 h 30");
  });

  it("écrit une plage « de … à … », sans tiret", () => {
    expect(
      formaterPlage(new Date("2026-11-10T13:00:00Z"), new Date("2026-11-10T14:30:00Z")),
    ).toBe("de 14 h à 15 h 30");
  });

  it("écrit une durée en heures et minutes", () => {
    expect(formaterDuree(60)).toBe("1 h");
    expect(formaterDuree(90)).toBe("1 h 30");
    expect(formaterDuree(30)).toBe("30 min");
    expect(formaterDuree(600)).toBe("10 h");
  });
});
