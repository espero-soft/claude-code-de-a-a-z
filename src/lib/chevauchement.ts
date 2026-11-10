// Règle R3 du cahier des charges : deux réservations confirmées ne peuvent pas
// se chevaucher sur la même salle. Seules les réservations CONFIRMEE bloquent
// un créneau ; une réservation EN_ATTENTE ou ANNULEE ne compte pas.

import type { StatutReservation } from "@/generated/prisma/enums";
import { formaterPlage } from "@/lib/format";

export type Creneau = { debut: Date; fin: Date };

// Créneau demandé sur une salle, à la réservation comme à la confirmation.
export type DemandeCreneau = Creneau & { salleId: string };

export type ReservationExistante = Creneau & {
  id: string;
  salleId: string;
  statut: StatutReservation;
};

// Message affiché au client : il indique l'horaire déjà pris pour qu'il
// sache quand la salle est libre.
export function messageCreneauPris(reserve: Creneau): string {
  return `Cette salle est déjà réservée ${formaterPlage(reserve.debut, reserve.fin)}. Choisissez un autre horaire.`;
}

// Créneaux semi-ouverts [debut, fin[ : deux créneaux qui se touchent
// (l'un finit à 10 h, l'autre commence à 10 h) ne se chevauchent pas.
export function chevauche(a: Creneau, b: Creneau): boolean {
  return (
    a.debut.getTime() < b.fin.getTime() && b.debut.getTime() < a.fin.getTime()
  );
}

// Première réservation confirmée de la même salle qui chevauche la demande,
// ou null si le créneau est libre. À la confirmation, la réservation
// elle-même est EN_ATTENTE : le filtre sur le statut l'écarte déjà.
export function conflitConfirme(
  demande: DemandeCreneau,
  existantes: readonly ReservationExistante[],
): ReservationExistante | null {
  return (
    existantes.find(
      (r) =>
        r.statut === "CONFIRMEE" &&
        r.salleId === demande.salleId &&
        chevauche(r, demande),
    ) ?? null
  );
}
