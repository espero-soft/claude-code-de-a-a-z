import { describe, expect, it } from "vitest";
import { motifAnnulation, type ReservationAnnulee } from "./motif-annulation";
import type { SessionPaiement } from "./paiement";

// Motif affiché pour une réservation annulée : R6 sans paiement (rien
// d'encaissé), ou paiement remboursé (tardif R6, montant R5, créneau pris R3).

const creeeA = new Date("2026-11-10T09:00:00Z");
const apres = (minutes: number, secondes = 0) =>
  new Date(creeeA.getTime() + (minutes * 60 + secondes) * 1000);

const MONTANT = 8000; // 2 h à 40 € de l'heure

function reservation(changements: Partial<ReservationAnnulee> = {}): ReservationAnnulee {
  return {
    id: "resa-1",
    createdAt: creeeA,
    montantTotalCentimes: MONTANT,
    stripeSessionId: "cs_test_1",
    ...changements,
  };
}

// Session payée par défaut, encaissée `payeeA` (10 minutes après la création).
function session(
  changements: Partial<SessionPaiement> = {},
  payeeA: Date = apres(10),
): SessionPaiement {
  return {
    id: "cs_test_1",
    status: "complete",
    payment_status: "paid",
    amount_total: MONTANT,
    currency: "eur",
    client_reference_id: "resa-1",
    payment_intent: {
      id: "pi_1",
      latest_charge: { created: payeeA.getTime() / 1000 },
    } as unknown as SessionPaiement["payment_intent"],
    url: null,
    ...changements,
  };
}

describe("motifAnnulation : délai dépassé sans paiement (R6)", () => {
  it("sans session : le client n'a jamais cliqué sur « Payer »", () => {
    expect(motifAnnulation(reservation({ stripeSessionId: null }), null)).toEqual({
      motif: "delai-depasse",
    });
  });

  it("session expirée sans paiement", () => {
    const expiree = session({ status: "expired", payment_status: "unpaid", payment_intent: null });
    expect(motifAnnulation(reservation(), expiree)).toEqual({ motif: "delai-depasse" });
  });
});

describe("motifAnnulation : paiement remboursé", () => {
  it("payé après 15 minutes : paiement tardif (R6)", () => {
    expect(motifAnnulation(reservation(), session({}, apres(15, 1)))).toEqual({
      motif: "rembourse",
      cause: "paiement-tardif",
      montantPayeCentimes: MONTANT,
    });
  });

  it("payé à exactement 15 minutes, au bon montant : créneau pris (R3)", () => {
    expect(motifAnnulation(reservation(), session({}, apres(15)))).toEqual({
      motif: "rembourse",
      cause: "creneau-pris",
      montantPayeCentimes: MONTANT,
    });
  });

  it("montant différent de la base (R5) : rend le montant réellement payé", () => {
    expect(motifAnnulation(reservation(), session({ amount_total: 4000 }))).toEqual({
      motif: "rembourse",
      cause: "montant-different",
      montantPayeCentimes: 4000,
    });
  });

  it("autre devise : montant différent", () => {
    const motif = motifAnnulation(reservation(), session({ currency: "usd" }));
    expect(motif).toMatchObject({ motif: "rembourse", cause: "montant-different" });
  });

  it("sans date de paiement : remboursé, cause non déduite", () => {
    const sansDate = session({
      payment_intent: "pi_1" as SessionPaiement["payment_intent"],
    });
    expect(motifAnnulation(reservation(), sansDate)).toEqual({
      motif: "rembourse",
      montantPayeCentimes: MONTANT,
    });
  });
});

describe("motifAnnulation : motif inconnu", () => {
  it("Stripe n'a pas répondu", () => {
    expect(motifAnnulation(reservation(), "indisponible")).toEqual({ motif: "inconnu" });
  });

  it("session d'une autre réservation", () => {
    expect(
      motifAnnulation(reservation(), session({ client_reference_id: "resa-2" })),
    ).toEqual({ motif: "inconnu" });
  });
});
