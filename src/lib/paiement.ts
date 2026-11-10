// Paiement d'une réservation par Stripe Checkout : à partir de la réservation
// et de sa session Checkout relue auprès de Stripe, décide ce qu'il faut faire.
// Fonction pure (aucun appel à Stripe ni à la base) ; `maintenant` est injecté.
//
// Règle R6 : une réservation en attente de paiement depuis plus de 15 minutes
// est annulée. Un paiement compte à l'instant où Stripe l'a encaissé, pas à
// l'instant où le serveur le constate : un client qui paie à 14 min puis
// revient sur le site à 16 min a payé dans les délais.

import type Stripe from "stripe";
import type { StatutReservation } from "@/generated/prisma/enums";
import { estExpiree } from "@/lib/expiration";

export const DEVISE = "eur";

export type ReservationPayable = {
  id: string;
  statut: StatutReservation;
  createdAt: Date;
  montantTotalCentimes: number;
};

// Champs de la session Checkout utilisés ici. `payment_intent` doit être
// relu avec `expand: ["payment_intent.latest_charge"]` pour connaître
// l'instant du paiement.
export type SessionPaiement = Pick<
  Stripe.Checkout.Session,
  | "id"
  | "status"
  | "payment_status"
  | "amount_total"
  | "currency"
  | "client_reference_id"
  | "payment_intent"
  | "url"
>;

export type DecisionPaiement =
  // Rien à faire : réservation déjà traitée, ou délai pas encore écoulé.
  | { action: "aucune" }
  // Paiement vérifié et dans les délais : confirmer (R3 revérifiée à ce moment).
  // `paymentIntent` sert à rembourser si le créneau a été pris entre-temps.
  | { action: "confirmer"; paymentIntent: string }
  // R6 sans paiement : annuler, après avoir fermé la session encore ouverte
  // pour qu'elle ne puisse plus être payée.
  | { action: "annuler"; sessionAExpirer: string | null }
  // Paiement reçu mais inacceptable (trop tard, ou montant différent) :
  // rembourser puis annuler.
  | { action: "rembourser-et-annuler"; paymentIntent: string };

function idPaymentIntent(session: SessionPaiement): string | null {
  const pi = session.payment_intent;
  if (!pi) return null;
  return typeof pi === "string" ? pi : pi.id;
}

// Instant de l'encaissement (date de la charge), ou null si Stripe ne l'a pas
// renvoyé (payment_intent non développé).
export function instantPaiement(session: SessionPaiement): Date | null {
  const pi = session.payment_intent;
  if (!pi || typeof pi === "string") return null;
  const charge = pi.latest_charge;
  if (!charge || typeof charge === "string") return null;
  return new Date(charge.created * 1000);
}

// Le montant payé est celui calculé en base (R5), en euros.
function montantConforme(
  session: SessionPaiement,
  reservation: ReservationPayable,
): boolean {
  return (
    session.amount_total === reservation.montantTotalCentimes &&
    session.currency === DEVISE
  );
}

export function decisionPaiement(
  reservation: ReservationPayable,
  session: SessionPaiement | null,
  maintenant: Date,
): DecisionPaiement {
  if (reservation.statut !== "EN_ATTENTE") return { action: "aucune" };

  // Une session qui ne désigne pas cette réservation est ignorée.
  const sienne =
    session && session.client_reference_id === reservation.id ? session : null;

  const paymentIntent = sienne && idPaymentIntent(sienne);
  if (
    sienne?.status === "complete" &&
    sienne.payment_status === "paid" &&
    paymentIntent
  ) {
    // Sans date de paiement, on retient l'instant présent : en cas de doute,
    // on ne confirme pas un paiement peut-être tardif.
    const payeeA = instantPaiement(sienne) ?? maintenant;
    if (!montantConforme(sienne, reservation) || estExpiree(reservation, payeeA)) {
      return { action: "rembourser-et-annuler", paymentIntent };
    }
    return { action: "confirmer", paymentIntent };
  }

  if (estExpiree(reservation, maintenant)) {
    return {
      action: "annuler",
      sessionAExpirer: sienne?.status === "open" ? sienne.id : null,
    };
  }
  return { action: "aucune" };
}
