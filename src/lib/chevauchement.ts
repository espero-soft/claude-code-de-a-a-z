// Règle R3 du cahier des charges : deux réservations confirmées ne peuvent pas
// se chevaucher sur la même salle. Seules les réservations CONFIRMEE bloquent
// un créneau ; une réservation EN_ATTENTE ou ANNULEE ne compte pas.

import type { StatutReservation } from "@/generated/prisma/enums";

export type Creneau = { debut: Date; fin: Date };

export type ReservationExistante = Creneau & {
  id: string;
  salleId: string;
  statut: StatutReservation;
};

export const MESSAGE_CRENEAU_PRIS =
  "Ce créneau est déjà réservé pour cette salle. Choisissez un autre horaire.";

// Créneaux semi-ouverts [debut, fin[ : deux créneaux qui se touchent
// (l'un finit à 10 h, l'autre commence à 10 h) ne se chevauchent pas.
export function chevauche(a: Creneau, b: Creneau): boolean {
  return (
    a.debut.getTime() < b.fin.getTime() && b.debut.getTime() < a.fin.getTime()
  );
}

// Première réservation confirmée de la même salle qui chevauche la demande,
// ou null si le créneau est libre. `demande.id` permet d'ignorer la
// réservation elle-même quand on vérifie au moment de la confirmer.
export function conflitConfirme(
  demande: Creneau & { salleId: string; id?: string },
  existantes: readonly ReservationExistante[],
): ReservationExistante | null {
  return (
    existantes.find(
      (r) =>
        r.statut === "CONFIRMEE" &&
        r.salleId === demande.salleId &&
        r.id !== demande.id &&
        chevauche(r, demande),
    ) ?? null
  );
}
