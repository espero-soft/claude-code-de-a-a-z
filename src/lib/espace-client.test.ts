import { describe, expect, it } from "vitest";
import {
  actionsReservation,
  classerReservations,
  rubrique,
  salutation,
  statutAffiche,
  type ReservationClient,
} from "./espace-client";

const MAINTENANT = new Date("2026-11-10T10:00:00Z");
const heures = (h: number) => new Date(MAINTENANT.getTime() + h * 3_600_000);
const minutes = (m: number) => new Date(MAINTENANT.getTime() + m * 60_000);

function reservation(
  id: string,
  statut: ReservationClient["statut"],
  debutH: number,
  options: { finH?: number; creeeIlYaMin?: number; salleActive?: boolean } = {},
): ReservationClient {
  return {
    id,
    statut,
    debut: heures(debutH),
    fin: heures(options.finH ?? debutH + 1),
    createdAt: minutes(-(options.creeeIlYaMin ?? 5)),
    salle: { id: "horizon", active: options.salleActive ?? true },
  };
}

describe("rubrique", () => {
  it("en attente tant que les 15 minutes de R6 ne sont pas écoulées", () => {
    expect(rubrique(reservation("a", "EN_ATTENTE", 24, { creeeIlYaMin: 15 }), MAINTENANT)).toBe(
      "en-attente",
    );
    expect(rubrique(reservation("a", "EN_ATTENTE", 24, { creeeIlYaMin: 16 }), MAINTENANT)).toBe(
      "passees",
    );
  });

  it("à venir : confirmée et pas encore terminée, réunion en cours comprise", () => {
    expect(rubrique(reservation("c", "CONFIRMEE", 48), MAINTENANT)).toBe("a-venir");
    expect(rubrique(reservation("c", "CONFIRMEE", -1, { finH: 1 }), MAINTENANT)).toBe("a-venir");
  });

  it("passée : confirmée terminée (fin atteinte), ou annulée même future", () => {
    expect(rubrique(reservation("c", "CONFIRMEE", -2, { finH: 0 }), MAINTENANT)).toBe("passees");
    expect(rubrique(reservation("x", "ANNULEE", 48), MAINTENANT)).toBe("passees");
  });
});

describe("statutAffiche", () => {
  it("distingue une réservation terminée et applique R6 avant l'actualisation en base", () => {
    expect(statutAffiche(reservation("c", "CONFIRMEE", -3), MAINTENANT)).toBe("TERMINEE");
    expect(statutAffiche(reservation("c", "CONFIRMEE", 3), MAINTENANT)).toBe("CONFIRMEE");
    expect(statutAffiche(reservation("a", "EN_ATTENTE", 3, { creeeIlYaMin: 20 }), MAINTENANT)).toBe(
      "ANNULEE",
    );
    expect(statutAffiche(reservation("a", "EN_ATTENTE", 3), MAINTENANT)).toBe("EN_ATTENTE");
  });
});

describe("classerReservations", () => {
  it("range et trie chaque rubrique", () => {
    const liste = [
      reservation("venir-loin", "CONFIRMEE", 72),
      reservation("passee-ancienne", "CONFIRMEE", -72),
      reservation("attente", "EN_ATTENTE", 30),
      reservation("venir-proche", "CONFIRMEE", 24),
      reservation("annulee", "ANNULEE", 10),
      reservation("passee-recente", "CONFIRMEE", -24),
    ];
    const { enAttente, aVenir, passees } = classerReservations(liste, MAINTENANT);
    expect(enAttente.map((r) => r.id)).toEqual(["attente"]);
    expect(aVenir.map((r) => r.id)).toEqual(["venir-proche", "venir-loin"]);
    expect(passees.map((r) => r.id)).toEqual(["annulee", "passee-recente", "passee-ancienne"]);
  });

  it("ne modifie pas la liste reçue", () => {
    const liste = [reservation("b", "CONFIRMEE", 48), reservation("a", "CONFIRMEE", 24)];
    classerReservations(liste, MAINTENANT);
    expect(liste.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("actionsReservation", () => {
  it("en attente : payer, ou voir le détail", () => {
    expect(actionsReservation(reservation("a", "EN_ATTENTE", 24), MAINTENANT)).toEqual([
      { type: "payer" },
      { type: "detail", href: "/reservations/a" },
    ]);
  });

  it("confirmée à venir : jamais « Payer », seulement le détail", () => {
    expect(actionsReservation(reservation("c", "CONFIRMEE", 24), MAINTENANT)).toEqual([
      { type: "detail", href: "/reservations/c" },
    ]);
  });

  it("passée : réserver à nouveau la même salle", () => {
    expect(actionsReservation(reservation("p", "CONFIRMEE", -24), MAINTENANT)).toEqual([
      { type: "detail", href: "/reservations/p" },
      { type: "reserver", href: "/salles/horizon/reserver", libelle: "Réserver à nouveau" },
    ]);
  });

  it("annulée, ou en attente expirée : choisir un autre créneau, jamais payer", () => {
    for (const r of [
      reservation("x", "ANNULEE", 24),
      reservation("x", "EN_ATTENTE", 24, { creeeIlYaMin: 30 }),
    ]) {
      expect(actionsReservation(r, MAINTENANT)).toEqual([
        { type: "detail", href: "/reservations/x" },
        { type: "reserver", href: "/salles/horizon/reserver", libelle: "Choisir un autre créneau" },
      ]);
    }
  });

  it("salle retirée de la location : plus de lien vers son formulaire", () => {
    expect(
      actionsReservation(reservation("p", "CONFIRMEE", -24, { salleActive: false }), MAINTENANT),
    ).toEqual([{ type: "detail", href: "/reservations/p" }]);
  });
});

describe("salutation", () => {
  it("salue par le prénom, ou sans nom pour un compte qui n'en a pas encore", () => {
    expect(salutation("Claire Dubois")).toBe("Bonjour, Claire");
    expect(salutation("  Camille  ")).toBe("Bonjour, Camille");
    expect(salutation("")).toBe("Bonjour");
    expect(salutation("   ")).toBe("Bonjour");
  });
});
