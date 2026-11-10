// Suivi du paiement d'une réservation, sans webhook : à chaque consultation de
// la réservation et à chaque clic sur « Payer », le serveur relit la session
// Checkout auprès de Stripe et applique la décision de `decisionPaiement` :
// confirmation (R3 revérifiée), annulation (R6) ou remboursement.

import { messageCreneauPris } from "@/lib/chevauchement";
import { confirmerReservation } from "@/lib/confirmation";
import { trouverConflitConfirme } from "@/lib/conflit-confirme";
import { decisionPaiement, DEVISE, type SessionPaiement } from "@/lib/paiement";
import { prisma } from "@/lib/prisma";
import { FUSEAU_CENTRE } from "@/lib/reservation";
import { obtenirStripe } from "@/lib/stripe";

// Lecture seule, sans Stripe : repli quand Stripe ne répond pas.
export function lireReservation(id: string) {
  return prisma.reservation.findUnique({
    where: { id },
    include: {
      salle: { select: { id: true, nom: true, photo: true, capacite: true, active: true } },
    },
  });
}

export type ReservationLue = NonNullable<Awaited<ReturnType<typeof lireReservation>>>;

// Écriture conditionnelle : on n'annule qu'une réservation encore EN_ATTENTE
// (une confirmation simultanée l'emporte).
async function annuler(id: string) {
  await prisma.reservation.updateMany({
    where: { id, statut: "EN_ATTENTE" },
    data: { statut: "ANNULEE" },
  });
}

// La clé d'idempotence empêche un double remboursement si deux requêtes
// traitent le même paiement en même temps.
async function rembourser(paymentIntent: string) {
  await obtenirStripe().refunds.create(
    { payment_intent: paymentIntent },
    { idempotencyKey: `remboursement-${paymentIntent}` },
  );
}

// Relit la réservation, met son statut à jour d'après Stripe et R6, et la
// renvoie (null si elle n'existe pas). `session` est la session Checkout
// relue, si la réservation est restée EN_ATTENTE.
export async function actualiserReservation(
  id: string,
  maintenant: Date,
): Promise<{ reservation: ReservationLue | null; session: SessionPaiement | null }> {
  const reservation = await lireReservation(id);
  if (!reservation || reservation.statut !== "EN_ATTENTE") {
    return { reservation, session: null };
  }

  // Seul le serveur interroge Stripe : rien de ce que renvoie le navigateur
  // (paramètres du retour de paiement) n'est cru sur parole.
  const session = reservation.stripeSessionId
    ? await obtenirStripe().checkout.sessions.retrieve(reservation.stripeSessionId, {
        expand: ["payment_intent.latest_charge"],
      })
    : null;

  const decision = decisionPaiement(reservation, session, maintenant);
  switch (decision.action) {
    case "aucune":
      return { reservation, session };

    case "confirmer": {
      const resultat = await confirmerReservation(id);
      // R3 : un autre client a confirmé ce créneau pendant le paiement.
      if (!resultat.ok && resultat.raison === "creneau-pris") {
        await rembourser(decision.paymentIntent);
        await annuler(id);
      }
      break;
    }

    // Rembourser d'abord : si l'annulation échoue, la prochaine consultation
    // recommence sans rembourser deux fois (clé d'idempotence).
    case "rembourser-et-annuler":
      await rembourser(decision.paymentIntent);
      await annuler(id);
      break;

    case "annuler":
      if (decision.sessionAExpirer) {
        try {
          await obtenirStripe().checkout.sessions.expire(decision.sessionAExpirer);
        } catch {
          // La session ne peut plus être fermée : elle vient sans doute d'être
          // payée. On n'annule pas ; la prochaine consultation verra le
          // paiement et le traitera (remboursement s'il est tardif).
          return { reservation, session };
        }
      }
      await annuler(id);
      break;
  }

  return { reservation: await lireReservation(id), session: null };
}

// Avant de supprimer un compte (src/lib/suppression-compte.ts) : aucune de
// ses réservations ne doit rester payable. Sinon, le client paierait après la
// suppression une réservation que plus personne ne consulte : ni confirmée,
// ni remboursée. Chaque réservation EN_ATTENTE envoyée à Stripe est
// actualisée (un paiement déjà fait est confirmé ou remboursé), puis sa
// session encore ouverte est fermée. Renvoie false si l'une n'a pas pu l'être
// (paiement en train d'aboutir, Stripe injoignable) : on ne supprime pas.
export async function fermerPaiementsEnCours(utilisateurId: string, maintenant: Date): Promise<boolean> {
  const enAttente = await prisma.reservation.findMany({
    where: { utilisateurId, statut: "EN_ATTENTE", stripeSessionId: { not: null } },
    select: { id: true },
  });
  try {
    for (const { id } of enAttente) {
      const { reservation } = await actualiserReservation(id, maintenant);
      if (reservation?.statut !== "EN_ATTENTE" || !reservation.stripeSessionId) continue;
      const stripe = obtenirStripe();
      const session = await stripe.checkout.sessions.retrieve(reservation.stripeSessionId);
      if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
      else if (session.status !== "expired") return false; // payée, pas encore traitée
    }
  } catch (erreur) {
    console.error("Fermeture des paiements en cours impossible", erreur);
    return false;
  }
  return true;
}

const formatDate = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU_CENTRE,
  dateStyle: "full",
});
const formatHeure = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU_CENTRE,
  timeStyle: "short",
});

// Aussi la réponse à qui n'a pas le droit de payer la réservation : on ne
// confirme pas qu'elle existe (src/app/reservations/[id]/actions.ts).
export const RESERVATION_INEXISTANTE = "Cette réservation n'existe pas.";

export type ResultatOuverture =
  // URL où envoyer le client : la page Stripe Checkout, ou la page de la
  // réservation si elle n'est plus à payer.
  | { ok: true; url: string }
  | { ok: false; erreur: string };

// Clic sur « Payer » : vérifie que la réservation peut encore être payée
// (R6, R3), puis renvoie l'URL d'une session Checkout pour le montant
// enregistré en base. `origine` est l'adresse du site (retour après paiement).
export async function ouvrirPaiement(
  id: string,
  origine: string,
  maintenant: Date,
): Promise<ResultatOuverture> {
  const { reservation, session } = await actualiserReservation(id, maintenant);
  if (!reservation) return { ok: false, erreur: RESERVATION_INEXISTANTE };

  const page = `/reservations/${reservation.id}`;
  // Confirmée, ou annulée à l'instant par R6 : la page affiche le nouveau statut.
  if (reservation.statut !== "EN_ATTENTE") return { ok: true, url: page };

  // Un paiement déjà commencé reprend là où il en était.
  if (session?.status === "open" && session.url) {
    return { ok: true, url: session.url };
  }

  // R3 : inutile de faire payer un créneau déjà confirmé pour un autre client.
  const conflit = await trouverConflitConfirme(prisma, reservation);
  if (conflit) return { ok: false, erreur: messageCreneauPris(conflit) };

  const stripe = obtenirStripe();
  const nouvelle = await stripe.checkout.sessions.create({
    mode: "payment",
    // Carte seulement : le paiement est immédiat, sans moyen de paiement
    // différé qui arriverait après le délai de R6.
    // Managed Payments (activé par défaut sur certains comptes) refuse cette
    // restriction : on le désactive pour cette session.
    allowed_payment_method_types: ["card"],
    managed_payments: { enabled: false },
    client_reference_id: reservation.id,
    customer_email: reservation.emailClient,
    metadata: { reservationId: reservation.id },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: DEVISE,
          // Montant calculé en base (R5), jamais repris du navigateur.
          unit_amount: reservation.montantTotalCentimes,
          product_data: {
            name: `Salle ${reservation.salle.nom}`,
            description: `Le ${formatDate.format(reservation.debut)}, de ${formatHeure.format(reservation.debut)} à ${formatHeure.format(reservation.fin)}`,
          },
        },
      },
    ],
    success_url: `${origine}${page}`,
    cancel_url: `${origine}${page}`,
  });

  // N'enregistre la session que si personne ne l'a fait entre-temps (double
  // clic) : une seule session payable à la fois par réservation.
  const { count } = await prisma.reservation.updateMany({
    where: {
      id: reservation.id,
      statut: "EN_ATTENTE",
      stripeSessionId: reservation.stripeSessionId,
    },
    data: { stripeSessionId: nouvelle.id },
  });
  if (count === 0 || !nouvelle.url) {
    await stripe.checkout.sessions.expire(nouvelle.id);
    return { ok: true, url: page };
  }
  return { ok: true, url: nouvelle.url };
}
