import { describe, expect, it } from "vitest";
import { verifierCreneau, type Creneau } from "./verifier-creneau";

// « Maintenant » : lundi 9 novembre 2026, 10 h à Paris (heure d'hiver, UTC+1).
const MAINTENANT = new Date("2026-11-09T09:00:00Z");

// Mardi 10 novembre 2026, de 9 h à 11 h : un créneau valide.
function creneau(changements: Partial<Creneau> = {}): Creneau {
  return { date: "2026-11-10", heureDebut: "09:00", heureFin: "11:00", ...changements };
}

function erreurUnique(changements: Partial<Creneau>) {
  const verdict = verifierCreneau(creneau(changements), MAINTENANT);
  expect(verdict.respecte).toBe(false);
  expect(verdict.erreurs).toHaveLength(1);
  return verdict.erreurs[0];
}

describe("verifierCreneau", () => {
  it("accepte un créneau valide", () => {
    expect(verifierCreneau(creneau(), MAINTENANT)).toEqual({ respecte: true, erreurs: [] });
  });

  // Chaque message de validerReservation doit être rattaché à la bonne règle.
  it.each([
    ["R1", "durée inférieure à 1 h", { heureFin: "09:30" }, "heureFin"],
    ["R1", "début hors tranche de 30 min", { heureDebut: "09:15" }, "heureDebut"],
    ["R1", "fin hors tranche de 30 min", { heureFin: "10:45" }, "heureFin"],
    ["R1", "fin avant le début", { heureDebut: "11:00", heureFin: "10:00" }, "heureFin"],
    ["R2", "samedi", { date: "2026-11-14" }, "date"],
    ["R2", "dimanche", { date: "2026-11-15" }, "date"],
    ["R2", "avant 8 h", { heureDebut: "07:30" }, "heureDebut"],
    ["R2", "fin après 20 h", { heureDebut: "19:00", heureFin: "20:30" }, "heureFin"],
    ["R4", "jour passé", { date: "2026-11-06" }, "date"],
    ["R4", "heure passée le jour même", { date: "2026-11-09", heureDebut: "09:00" }, "heureDebut"],
  ] as const)("%s : refuse (%s)", (regle, _cas, changements, champ) => {
    const erreur = erreurUnique(changements);
    expect(erreur.regle).toBe(regle);
    expect(erreur.champ).toBe(champ);
  });

  it.each([
    ["date mal formée", { date: "10/11/2026" }, "date"],
    ["date inexistante", { date: "2026-02-31" }, "date"],
    ["heure mal formée", { heureDebut: "9h" }, "heureDebut"],
    ["heure vide", { heureFin: "" }, "heureFin"],
  ] as const)("ne cite aucune règle pour une saisie invalide (%s)", (_cas, changements, champ) => {
    const erreur = erreurUnique(changements);
    expect(erreur.regle).toBeNull();
    expect(erreur.champ).toBe(champ);
  });

  // Un début à 20 h rend aussi toute heure de fin invalide (après 20 h, ou pas après le début).
  it("R2 : refuse un début à 20 h", () => {
    const verdict = verifierCreneau(creneau({ heureDebut: "20:00", heureFin: "21:00" }), MAINTENANT);
    expect(verdict.erreurs).toEqual([
      { champ: "heureDebut", regle: "R2", message: "Le centre ferme à 20 h." },
      { champ: "heureFin", regle: "R2", message: "Le centre ferme à 20 h." },
    ]);
  });

  it("signale plusieurs règles à la fois", () => {
    const verdict = verifierCreneau(
      creneau({ date: "2026-11-14", heureDebut: "07:00", heureFin: "07:30" }),
      MAINTENANT,
    );
    expect(verdict.erreurs.map((e) => e.regle)).toEqual(["R2", "R2", "R1"]);
  });
});
