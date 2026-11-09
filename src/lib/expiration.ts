// Règle R6 du cahier des charges : une réservation en attente de paiement depuis
// plus de 15 minutes est expirée. « Plus de » au sens strict : à exactement
// 15 minutes, la réservation n'est pas encore expirée.

import type { StatutReservation } from "@/generated/prisma/enums";

export const DELAI_PAIEMENT_MS = 15 * 60 * 1000;

export type ReservationAPayer = {
  statut: StatutReservation;
  createdAt: Date;
};

// Seule une réservation EN_ATTENTE peut expirer ; `maintenant` est injecté
// pour des tests déterministes.
export function estExpiree(reservation: ReservationAPayer, maintenant: Date): boolean {
  if (reservation.statut !== "EN_ATTENTE") return false;
  return maintenant.getTime() - reservation.createdAt.getTime() > DELAI_PAIEMENT_MS;
}
