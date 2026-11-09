import { describe, expect, it } from "vitest";
import {
  heureDeParis,
  validerReservation,
  type SaisieReservation,
} from "./reservation";

// « Maintenant » : lundi 9 novembre 2026, 10 h à Paris (heure d'hiver, UTC+1).
const MAINTENANT = new Date("2026-11-09T09:00:00Z");

// Mardi 10 novembre 2026, de 9 h à 11 h : une demande valide.
function saisie(changements: Partial<SaisieReservation> = {}): SaisieReservation {
  return {
    date: "2026-11-10",
    heureDebut: "09:00",
    heureFin: "11:00",
    nomClient: "Camille Martin",
    emailClient: "camille@example.com",
    ...changements,
  };
}

function erreurs(changements: Partial<SaisieReservation>) {
  const resultat = validerReservation(saisie(changements), MAINTENANT);
  if (resultat.ok) throw new Error("La demande aurait dû être refusée.");
  return resultat.erreurs;
}

describe("heureDeParis", () => {
  it("convertit l'heure d'hiver de Paris (UTC+1)", () => {
    expect(heureDeParis("2026-11-10", "09:00").toISOString()).toBe(
      "2026-11-10T08:00:00.000Z",
    );
  });

  it("convertit l'heure d'été de Paris (UTC+2)", () => {
    expect(heureDeParis("2026-07-15", "09:00").toISOString()).toBe(
      "2026-07-15T07:00:00.000Z",
    );
  });
});

describe("validerReservation", () => {
  it("accepte une demande correcte et renvoie les instants", () => {
    const resultat = validerReservation(saisie(), MAINTENANT);
    expect(resultat).toEqual({
      ok: true,
      debut: new Date("2026-11-10T08:00:00Z"),
      fin: new Date("2026-11-10T10:00:00Z"),
      nomClient: "Camille Martin",
      emailClient: "camille@example.com",
    });
  });

  describe("R1 : au moins 1 heure, par tranches de 30 minutes", () => {
    it("refuse une réservation de 30 minutes", () => {
      expect(erreurs({ heureFin: "09:30" }).heureFin).toBe(
        "Une réservation dure au moins 1 heure.",
      );
    });

    it("accepte 1 h 30", () => {
      expect(validerReservation(saisie({ heureFin: "10:30" }), MAINTENANT).ok).toBe(true);
    });

    it("refuse une heure qui ne tombe pas sur une demi-heure", () => {
      expect(erreurs({ heureDebut: "09:15" }).heureDebut).toMatch(/demi-heure/);
      expect(erreurs({ heureFin: "10:45" }).heureFin).toMatch(/demi-heure/);
    });

    it("refuse une fin avant le début", () => {
      expect(erreurs({ heureDebut: "11:00", heureFin: "10:00" }).heureFin).toBe(
        "L'heure de fin doit être après l'heure de début.",
      );
    });
  });

  describe("R2 : du lundi au vendredi, de 8 h à 20 h", () => {
    it("refuse le samedi et le dimanche", () => {
      expect(erreurs({ date: "2026-11-14" }).date).toBe(
        "Le centre est ouvert du lundi au vendredi.",
      );
      expect(erreurs({ date: "2026-11-15" }).date).toBe(
        "Le centre est ouvert du lundi au vendredi.",
      );
    });

    it("refuse un début avant 8 h", () => {
      expect(erreurs({ heureDebut: "07:30" }).heureDebut).toBe("Le centre ouvre à 8 h.");
    });

    it("refuse une fin après 20 h", () => {
      expect(erreurs({ heureDebut: "19:00", heureFin: "20:30" }).heureFin).toBe(
        "Le centre ferme à 20 h.",
      );
    });

    it("accepte les bornes : 8 h à 9 h et 19 h à 20 h", () => {
      const tot = saisie({ heureDebut: "08:00", heureFin: "09:00" });
      const tard = saisie({ heureDebut: "19:00", heureFin: "20:00" });
      expect(validerReservation(tot, MAINTENANT).ok).toBe(true);
      expect(validerReservation(tard, MAINTENANT).ok).toBe(true);
    });
  });

  describe("R4 : pas dans le passé", () => {
    it("refuse une date passée", () => {
      expect(erreurs({ date: "2026-11-06" }).date).toBe("Cette date est déjà passée.");
    });

    it("refuse une heure déjà passée aujourd'hui", () => {
      expect(erreurs({ date: "2026-11-09", heureDebut: "09:00" }).heureDebut).toBe(
        "Cette heure est déjà passée.",
      );
    });

    it("accepte plus tard dans la journée", () => {
      const cetApresMidi = saisie({ date: "2026-11-09", heureDebut: "14:00", heureFin: "15:00" });
      expect(validerReservation(cetApresMidi, MAINTENANT).ok).toBe(true);
    });
  });

  describe("coordonnées du client", () => {
    it("exige un nom et une adresse e-mail valide", () => {
      const e = erreurs({ nomClient: "   ", emailClient: "camille@" });
      expect(e.nomClient).toBe("Indiquez votre nom.");
      expect(e.emailClient).toBe("Cette adresse e-mail n'est pas valide.");
    });

    it("refuse une date qui n'existe pas", () => {
      expect(erreurs({ date: "2026-02-31" }).date).toBe("Cette date n'est pas valide.");
    });
  });
});
