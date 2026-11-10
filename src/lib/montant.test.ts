import { describe, expect, it } from "vitest";
import { calculerMontant } from "@/lib/montant";

// Salle à 40 € de l'heure.
const PRIX = 4000;
const debut = new Date("2026-11-10T09:00:00");

describe("calculerMontant (règle R5)", () => {
  it("1 h coûte le prix d'une heure", () => {
    const fin = new Date("2026-11-10T10:00:00");
    expect(calculerMontant(PRIX, debut, fin)).toBe(4000);
  });

  it("1 h 30 coûte une heure et demie", () => {
    const fin = new Date("2026-11-10T10:30:00");
    expect(calculerMontant(PRIX, debut, fin)).toBe(6000);
  });

  it("arrondit au centime supérieur un prix impair sur 1 h 30", () => {
    // 40,01 € de l'heure : 4001 × 1,5 = 6001,5 centimes, arrondi à 6002 (60,02 €).
    const fin = new Date("2026-11-10T10:30:00");
    expect(calculerMontant(4001, debut, fin)).toBe(6002);
  });

  it("3 h coûtent trois heures", () => {
    const fin = new Date("2026-11-10T12:00:00");
    expect(calculerMontant(PRIX, debut, fin)).toBe(12000);
  });
});
