import { describe, expect, it } from "vitest";
import { formaterPrix } from "./format";

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
