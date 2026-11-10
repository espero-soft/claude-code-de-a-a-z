// Motif d'une réservation ANNULEE, pour l'expliquer au client sans rien
// promettre de faux. Le motif n'est pas enregistré en base : on le déduit,
// à l'affichage seulement, de la session Checkout relue auprès de Stripe.
// Fonction pure (aucun appel à Stripe ni à la base) ; ne décide rien : les
// annulations et les remboursements restent l'affaire de `decisionPaiement`.
//
// Une réservation n'est annulée que dans deux cas (suivi-paiement.ts) :
// - R6 sans paiement : délai de 15 minutes dépassé, rien n'a été encaissé ;
// - paiement encaissé puis remboursé : payé après le délai (R6), montant
//   différent de celui de la base (R5), ou créneau confirmé entre-temps pour
//   un autre client (R3).

import { DELAI_PAIEMENT_MS } from "@/lib/expiration";
import { DEVISE, instantPaiement, type SessionPaiement } from "@/lib/paiement";

export type ReservationAnnulee = {
  id: string;
  createdAt: Date;
  montantTotalCentimes: number;
  stripeSessionId: string | null;
};

export type CauseRemboursement = "paiement-tardif" | "montant-different" | "creneau-pris";

export type MotifAnnulation =
  // R6 : aucun paiement encaissé dans les 15 minutes.
  | { motif: "delai-depasse" }
  // Paiement encaissé puis remboursé. `cause` est absente si Stripe n'a pas
  // renvoyé la date du paiement ; `montantPayeCentimes` est ce que le client
  // a réellement payé (peut différer du montant de la base).
  | { motif: "rembourse"; cause?: CauseRemboursement; montantPayeCentimes: number }
  // Stripe n'a pas pu être interrogé, ou la session ne correspond pas.
  | { motif: "inconnu" };

// `session` : la session relue, ou `"indisponible"` si Stripe n'a pas répondu
// (null quand la réservation n'en a pas).
export function motifAnnulation(
  reservation: ReservationAnnulee,
  session: SessionPaiement | null | "indisponible",
): MotifAnnulation {
  // Jamais de clic sur « Payer » : rien n'a pu être encaissé.
  if (!reservation.stripeSessionId) return { motif: "delai-depasse" };
  if (session === "indisponible" || !session) return { motif: "inconnu" };
  if (session.client_reference_id !== reservation.id) return { motif: "inconnu" };

  // Session fermée ou expirée sans paiement : annulée par R6.
  if (session.payment_status !== "paid") return { motif: "delai-depasse" };

  const montantPayeCentimes = session.amount_total ?? reservation.montantTotalCentimes;
  const payeeA = instantPaiement(session);
  if (!payeeA) return { motif: "rembourse", montantPayeCentimes };

  // Mêmes contrôles, dans le même ordre d'importance, que decisionPaiement.
  const limite = reservation.createdAt.getTime() + DELAI_PAIEMENT_MS;
  let cause: CauseRemboursement;
  if (payeeA.getTime() > limite) cause = "paiement-tardif";
  else if (
    session.amount_total !== reservation.montantTotalCentimes ||
    session.currency !== DEVISE
  ) {
    cause = "montant-different";
  } else cause = "creneau-pris";
  return { motif: "rembourse", cause, montantPayeCentimes };
}
