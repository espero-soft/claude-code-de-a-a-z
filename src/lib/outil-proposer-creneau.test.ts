import { describe, expect, it, vi } from "vitest";
import type { ReservationExistante } from "./chevauchement";
import { heureDeParis } from "./reservation";
import { chercherCreneauxLibres } from "./outil-proposer-creneau";

// Le module lit la base dans proposerCreneauLibre ; la recherche testée ici
// est pure, on écarte donc le vrai client Prisma.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

// Mardi 10 novembre 2026, 9 h à Paris (8 h UTC).
const MAINTENANT = new Date("2026-11-10T08:00:00Z");

function confirmee(
  date: string,
  debut: string,
  fin: string,
  changements: Partial<ReservationExistante> = {},
): ReservationExistante {
  return {
    id: `r-${date}-${debut}`,
    salleId: "salle-a",
    statut: "CONFIRMEE",
    debut: heureDeParis(date, debut),
    fin: heureDeParis(date, fin),
    ...changements,
  };
}

const demande = (date: string, heureDebut: string, dureeMinutes = 60) => ({
  salleId: "salle-a",
  date,
  heureDebut,
  dureeMinutes,
});

const creneau = (date: string, heureDebut: string, heureFin: string) => ({
  date,
  heureDebut,
  heureFin,
});

describe("chercherCreneauxLibres", () => {
  it("propose le créneau demandé quand il est libre, puis les suivants par pas de 30 min", () => {
    const resultat = chercherCreneauxLibres(demande("2026-11-12", "10:00"), MAINTENANT, []);
    expect(resultat).toEqual({
      demandeLibre: true,
      motif: null,
      creneaux: [
        creneau("2026-11-12", "10:00", "11:00"),
        creneau("2026-11-12", "10:30", "11:30"),
        creneau("2026-11-12", "11:00", "12:00"),
      ],
    });
  });

  it("écarte un créneau pris par une réservation confirmée (R3) et propose la suite", () => {
    const resultat = chercherCreneauxLibres(demande("2026-11-12", "10:00", 120), MAINTENANT, [
      confirmee("2026-11-12", "10:00", "12:00"),
    ]);
    expect(resultat.demandeLibre).toBe(false);
    expect(resultat.motif).toBe(
      "Cette salle est déjà réservée de 10 h à 12 h. Choisissez un autre horaire.",
    );
    expect(resultat.creneaux).toEqual([
      creneau("2026-11-12", "12:00", "14:00"),
      creneau("2026-11-12", "12:30", "14:30"),
      creneau("2026-11-12", "13:00", "15:00"),
    ]);
  });

  it("ne tient compte que des réservations confirmées de la même salle", () => {
    const resultat = chercherCreneauxLibres(demande("2026-11-12", "10:00"), MAINTENANT, [
      confirmee("2026-11-12", "10:00", "12:00", { statut: "EN_ATTENTE" }),
      confirmee("2026-11-12", "10:00", "12:00", { statut: "ANNULEE" }),
      confirmee("2026-11-12", "10:00", "12:00", { salleId: "salle-b" }),
    ]);
    expect(resultat.demandeLibre).toBe(true);
    expect(resultat.creneaux[0]).toEqual(creneau("2026-11-12", "10:00", "11:00"));
  });

  it("refuse un samedi (R2) et propose le lundi suivant dès l'ouverture", () => {
    const resultat = chercherCreneauxLibres(demande("2026-11-14", "10:00"), MAINTENANT, []);
    expect(resultat.demandeLibre).toBe(false);
    expect(resultat.motif).toBe("Le centre est ouvert du lundi au vendredi.");
    expect(resultat.creneaux).toEqual([
      creneau("2026-11-16", "08:00", "09:00"),
      creneau("2026-11-16", "08:30", "09:30"),
      creneau("2026-11-16", "09:00", "10:00"),
    ]);
  });

  it("refuse un créneau qui finit après 20 h (R2) et passe au jour ouvré suivant", () => {
    const resultat = chercherCreneauxLibres(demande("2026-11-13", "19:30"), MAINTENANT, []);
    expect(resultat.demandeLibre).toBe(false);
    expect(resultat.motif).toBe("Le centre ferme à 20 h.");
    // Vendredi 13 → lundi 16 : le week-end est sauté.
    expect(resultat.creneaux[0]).toEqual(creneau("2026-11-16", "08:00", "09:00"));
  });

  it("garde le dernier créneau possible avant 20 h, puis passe au lendemain", () => {
    const resultat = chercherCreneauxLibres(demande("2026-11-12", "19:00"), MAINTENANT, []);
    expect(resultat.creneaux).toEqual([
      creneau("2026-11-12", "19:00", "20:00"),
      creneau("2026-11-13", "08:00", "09:00"),
      creneau("2026-11-13", "08:30", "09:30"),
    ]);
  });

  it("refuse une date passée (R4) et propose à partir de maintenant", () => {
    const resultat = chercherCreneauxLibres(demande("2026-11-09", "10:00"), MAINTENANT, []);
    expect(resultat.demandeLibre).toBe(false);
    expect(resultat.motif).toBe("Cette date est déjà passée.");
    // Il est 9 h : le créneau de 9 h est déjà commencé.
    expect(resultat.creneaux).toEqual([
      creneau("2026-11-10", "09:30", "10:30"),
      creneau("2026-11-10", "10:00", "11:00"),
      creneau("2026-11-10", "10:30", "11:30"),
    ]);
  });

  it("refuse une heure déjà passée aujourd'hui (R4)", () => {
    const resultat = chercherCreneauxLibres(demande("2026-11-10", "08:00"), MAINTENANT, []);
    expect(resultat.demandeLibre).toBe(false);
    expect(resultat.motif).toBe("Cette heure est déjà passée.");
    expect(resultat.creneaux[0]).toEqual(creneau("2026-11-10", "09:30", "10:30"));
  });

  it("refuse une durée de moins d'une heure (R1) et ne propose rien", () => {
    const resultat = chercherCreneauxLibres(demande("2026-11-12", "10:00", 30), MAINTENANT, []);
    expect(resultat.demandeLibre).toBe(false);
    expect(resultat.motif).toBe("Une réservation dure au moins 1 heure.");
    expect(resultat.creneaux).toEqual([]);
  });

  it("aligne une heure hors grille sur la demi-heure suivante (R1)", () => {
    const resultat = chercherCreneauxLibres(demande("2026-11-12", "10:15"), MAINTENANT, []);
    expect(resultat.demandeLibre).toBe(false);
    expect(resultat.creneaux[0]).toEqual(creneau("2026-11-12", "10:30", "11:30"));
  });
});
