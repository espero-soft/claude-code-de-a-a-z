// Espace client (/compte) : classement des réservations d'un compte et
// actions proposées selon leur statut. Fonctions pures, testées dans
// espace-client.test.ts ; `maintenant` est injecté.

import type { StatutReservation } from "@/generated/prisma/enums";
import { estExpiree } from "@/lib/expiration";

export type ReservationClient = {
  id: string;
  statut: StatutReservation;
  debut: Date;
  fin: Date;
  createdAt: Date;
  salle: { id: string; active: boolean };
};

export type Rubrique = "en-attente" | "a-venir" | "passees";

// - en attente : à payer, délai R6 pas encore écoulé ;
// - à venir : confirmée et pas encore terminée (une réunion en cours compte
//   encore : elle reste utile au client) ;
// - passées et annulées : tout le reste (confirmée terminée, annulée, ou en
//   attente dont les 15 minutes de R6 sont écoulées).
export function rubrique(reservation: ReservationClient, maintenant: Date): Rubrique {
  if (reservation.statut === "EN_ATTENTE" && !estExpiree(reservation, maintenant)) {
    return "en-attente";
  }
  if (reservation.statut === "CONFIRMEE" && reservation.fin > maintenant) return "a-venir";
  return "passees";
}

// Statut montré au client, qui distingue une réservation terminée et applique
// R6 même si la base n'a pas encore été actualisée.
export type StatutAffiche = StatutReservation | "TERMINEE";

export function statutAffiche(reservation: ReservationClient, maintenant: Date): StatutAffiche {
  if (estExpiree(reservation, maintenant)) return "ANNULEE";
  if (reservation.statut === "CONFIRMEE" && reservation.fin <= maintenant) return "TERMINEE";
  return reservation.statut;
}

export type ReservationsClassees<T> = {
  enAttente: T[]; // la plus proche d'abord
  aVenir: T[]; // la plus proche d'abord
  passees: T[]; // la plus récente d'abord
};

export function classerReservations<T extends ReservationClient>(
  reservations: readonly T[],
  maintenant: Date,
): ReservationsClassees<T> {
  const parDebut = [...reservations].sort((a, b) => a.debut.getTime() - b.debut.getTime());
  return {
    enAttente: parDebut.filter((r) => rubrique(r, maintenant) === "en-attente"),
    aVenir: parDebut.filter((r) => rubrique(r, maintenant) === "a-venir"),
    passees: parDebut.filter((r) => rubrique(r, maintenant) === "passees").reverse(),
  };
}

export type ActionReservation =
  | { type: "payer" }
  | { type: "detail"; href: string }
  | { type: "reserver"; href: string; libelle: string };

// Les bonnes actions selon le statut :
// - en attente : payer, ou voir le détail ;
// - à venir : voir le détail (déjà payée : jamais « Payer ») ;
// - passée ou annulée : voir le détail, et reprendre un créneau dans la même
//   salle si elle est toujours proposée.
// Pas d'annulation : le cahier des charges ne la prévoit pas.
export function actionsReservation(
  reservation: ReservationClient,
  maintenant: Date,
): ActionReservation[] {
  const detail = { type: "detail", href: `/reservations/${reservation.id}` } as const;
  switch (rubrique(reservation, maintenant)) {
    case "en-attente":
      return [{ type: "payer" }, detail];
    case "a-venir":
      return [detail];
    case "passees": {
      if (!reservation.salle.active) return [detail];
      const libelle =
        statutAffiche(reservation, maintenant) === "TERMINEE"
          ? "Réserver à nouveau"
          : "Choisir un autre créneau";
      return [detail, { type: "reserver", href: `/salles/${reservation.salle.id}/reserver`, libelle }];
    }
  }
}

// « Bonjour, Claire » avec le prénom (premier mot du nom du compte), ou
// « Bonjour » si le compte n'a pas encore de nom (créé par le code e-mail).
export function salutation(nom: string): string {
  const prenom = nom.trim().split(/\s+/)[0];
  return prenom ? `Bonjour, ${prenom}` : "Bonjour";
}
