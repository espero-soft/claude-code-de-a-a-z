import { describe, expect, it } from "vitest";
import {
  decisionPaiement,
  instantPaiement,
  type ReservationPayable,
  type SessionPaiement,
} from "./paiement";

// Paiement par Stripe Checkout, et R6 : une réservation en attente de paiement
// depuis plus de 15 minutes est annulée. Le délai se mesure jusqu'à
// l'encaissement par Stripe pour un paiement, jusqu'à maintenant sinon.

// Réservation créée le mardi 10 novembre 2026 à 9 h 00 (UTC, seule la durée compte).
const creeeA = new Date("2026-11-10T09:00:00Z");
const apres = (minutes: number, secondes = 0) =>
  new Date(creeeA.getTime() + (minutes * 60 + secondes) * 1000);

const MONTANT = 8000; // 2 h à 40 € de l'heure

function reservation(changements: Partial<ReservationPayable> = {}): ReservationPayable {
  return {
    id: "resa-1",
    statut: "EN_ATTENTE",
    createdAt: creeeA,
    montantTotalCentimes: MONTANT,
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

// Session encore ouverte : le client n'a pas (encore) payé.
const ouverte = () =>
  session({ status: "open", payment_status: "unpaid", payment_intent: null });

describe("decisionPaiement : paiement vérifié", () => {
  it("confirme une réservation payée dans les délais, au bon montant", () => {
    expect(decisionPaiement(reservation(), session(), apres(11))).toEqual({
      action: "confirmer",
      paymentIntent: "pi_1",
    });
  });

  it("accepte un payment_intent non développé (simple identifiant)", () => {
    // Sans date d'encaissement, le délai est mesuré jusqu'à maintenant.
    const s = session({ payment_intent: "pi_2" });
    expect(decisionPaiement(reservation(), s, apres(11))).toEqual({
      action: "confirmer",
      paymentIntent: "pi_2",
    });
  });

  it("rembourse et annule un montant différent de celui calculé en base", () => {
    expect(
      decisionPaiement(reservation(), session({ amount_total: 4000 }), apres(11)),
    ).toEqual({ action: "rembourser-et-annuler", paymentIntent: "pi_1" });
  });

  it("rembourse et annule un paiement dans une autre devise", () => {
    expect(
      decisionPaiement(reservation(), session({ currency: "usd" }), apres(11)),
    ).toEqual({ action: "rembourser-et-annuler", paymentIntent: "pi_1" });
  });

  it("ne confirme pas une session qui n'est pas payée", () => {
    const nonPayee = session({ payment_status: "unpaid" });
    expect(decisionPaiement(reservation(), nonPayee, apres(11))).toEqual({
      action: "aucune",
    });
  });

  it("ignore la session d'une autre réservation", () => {
    const autre = session({ client_reference_id: "resa-2" });
    expect(decisionPaiement(reservation(), autre, apres(11))).toEqual({
      action: "aucune",
    });
  });

  it("ne fait rien pour une réservation déjà confirmée ou annulée", () => {
    expect(
      decisionPaiement(reservation({ statut: "CONFIRMEE" }), session(), apres(60)),
    ).toEqual({ action: "aucune" });
    expect(
      decisionPaiement(reservation({ statut: "ANNULEE" }), session(), apres(60)),
    ).toEqual({ action: "aucune" });
  });
});

describe("decisionPaiement : R6 au moment du paiement", () => {
  it("confirme un paiement encaissé dans les délais, même constaté après 15 minutes", () => {
    // Payé à 14 min 59 s, client revenu sur le site à 40 min.
    expect(
      decisionPaiement(reservation(), session({}, apres(14, 59)), apres(40)),
    ).toEqual({ action: "confirmer", paymentIntent: "pi_1" });
  });

  it("confirme un paiement encaissé à exactement 15 minutes", () => {
    // « plus de 15 minutes » : la limite elle-même n'est pas dépassée.
    expect(
      decisionPaiement(reservation(), session({}, apres(15)), apres(15)),
    ).toEqual({ action: "confirmer", paymentIntent: "pi_1" });
  });

  it("rembourse et annule un paiement encaissé après 15 minutes", () => {
    expect(
      decisionPaiement(reservation(), session({}, apres(15, 1)), apres(16)),
    ).toEqual({ action: "rembourser-et-annuler", paymentIntent: "pi_1" });
  });
});

describe("decisionPaiement : R6 sans paiement", () => {
  it("ne fait rien tant que le délai n'est pas dépassé", () => {
    expect(decisionPaiement(reservation(), null, apres(14, 59))).toEqual({
      action: "aucune",
    });
    expect(decisionPaiement(reservation(), ouverte(), apres(15))).toEqual({
      action: "aucune",
    });
  });

  it("annule une réservation jamais payée après 15 minutes", () => {
    expect(decisionPaiement(reservation(), null, apres(15, 1))).toEqual({
      action: "annuler",
      sessionAExpirer: null,
    });
  });

  it("ferme la session encore ouverte avant d'annuler", () => {
    expect(decisionPaiement(reservation(), ouverte(), apres(15, 1))).toEqual({
      action: "annuler",
      sessionAExpirer: "cs_test_1",
    });
  });

  it("ne ferme pas une session déjà expirée chez Stripe", () => {
    const expiree = session({
      status: "expired",
      payment_status: "unpaid",
      payment_intent: null,
    });
    expect(decisionPaiement(reservation(), expiree, apres(60))).toEqual({
      action: "annuler",
      sessionAExpirer: null,
    });
  });
});

describe("instantPaiement", () => {
  it("lit la date de la charge (secondes Unix)", () => {
    expect(instantPaiement(session({}, apres(10)))).toEqual(apres(10));
  });

  it("renvoie null sans payment_intent développé", () => {
    expect(instantPaiement(session({ payment_intent: "pi_1" }))).toBeNull();
    expect(instantPaiement(ouverte())).toBeNull();
  });
});
