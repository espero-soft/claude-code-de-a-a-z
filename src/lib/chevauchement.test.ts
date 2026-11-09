import { describe, expect, it } from "vitest";
import {
  chevauche,
  conflitConfirme,
  type ReservationExistante,
} from "./chevauchement";

// Heures du mardi 10 novembre 2026 (UTC, la comparaison ne dépend pas du fuseau).
const h = (heure: string) => new Date(`2026-11-10T${heure}:00Z`);
const creneau = (debut: string, fin: string) => ({ debut: h(debut), fin: h(fin) });

function reservation(
  changements: Partial<ReservationExistante> = {},
): ReservationExistante {
  return {
    id: "r1",
    salleId: "salle-a",
    statut: "CONFIRMEE",
    ...creneau("09:00", "11:00"),
    ...changements,
  };
}

// Demande de 10 h à 12 h sur la salle A : chevauche la réservation 9 h à 11 h.
const demande = { salleId: "salle-a", ...creneau("10:00", "12:00") };

describe("chevauche", () => {
  it("détecte un chevauchement partiel, dans les deux sens", () => {
    expect(chevauche(creneau("09:00", "11:00"), creneau("10:00", "12:00"))).toBe(true);
    expect(chevauche(creneau("10:00", "12:00"), creneau("09:00", "11:00"))).toBe(true);
  });

  it("détecte un créneau inclus dans l'autre", () => {
    expect(chevauche(creneau("09:00", "13:00"), creneau("10:00", "11:00"))).toBe(true);
    expect(chevauche(creneau("10:00", "11:00"), creneau("09:00", "13:00"))).toBe(true);
  });

  it("détecte des créneaux identiques", () => {
    expect(chevauche(creneau("09:00", "11:00"), creneau("09:00", "11:00"))).toBe(true);
  });

  it("accepte des créneaux contigus", () => {
    expect(chevauche(creneau("09:00", "10:00"), creneau("10:00", "11:00"))).toBe(false);
    expect(chevauche(creneau("10:00", "11:00"), creneau("09:00", "10:00"))).toBe(false);
  });

  it("accepte des créneaux disjoints", () => {
    expect(chevauche(creneau("08:00", "09:00"), creneau("14:00", "16:00"))).toBe(false);
  });
});

describe("conflitConfirme", () => {
  it("renvoie la réservation confirmée qui chevauche la demande", () => {
    const existante = reservation();
    expect(conflitConfirme(demande, [existante])).toBe(existante);
  });

  it("renvoie null quand aucune réservation n'existe", () => {
    expect(conflitConfirme(demande, [])).toBeNull();
  });

  it("ignore une autre salle", () => {
    expect(conflitConfirme(demande, [reservation({ salleId: "salle-b" })])).toBeNull();
  });

  it("ignore une réservation annulée", () => {
    expect(conflitConfirme(demande, [reservation({ statut: "ANNULEE" })])).toBeNull();
  });

  it("ignore une réservation en attente de paiement", () => {
    expect(conflitConfirme(demande, [reservation({ statut: "EN_ATTENTE" })])).toBeNull();
  });

  it("accepte une demande contiguë à une réservation confirmée", () => {
    const contigue = { salleId: "salle-a", ...creneau("11:00", "12:00") };
    expect(conflitConfirme(contigue, [reservation()])).toBeNull();
  });

  it("ignore la réservation elle-même au moment de la confirmer", () => {
    const elleMeme = reservation({ id: "r2", ...creneau("10:00", "12:00") });
    expect(conflitConfirme({ ...demande, id: "r2" }, [elleMeme])).toBeNull();
  });

  it("trouve le conflit parmi plusieurs réservations", () => {
    const conflit = reservation({ id: "r3", ...creneau("11:30", "13:00") });
    const existantes = [
      reservation({ id: "r1", statut: "ANNULEE" }),
      reservation({ id: "r2", salleId: "salle-b" }),
      conflit,
    ];
    expect(conflitConfirme(demande, existantes)).toBe(conflit);
  });
});
