import type { Prisma } from "@/generated/prisma/client";
import {
  conflitConfirme,
  type DemandeCreneau,
  type ReservationExistante,
} from "@/lib/chevauchement";

// Accepte le client Prisma global comme le client d'une transaction.
type ClientReservations = Pick<Prisma.TransactionClient, "reservation">;

// Règle R3, côté base : cherche une réservation confirmée de la même salle qui
// chevauche le créneau demandé. Seule requête de ce genre dans l'application,
// utilisée à la réservation (`reserver`) et à la confirmation
// (`confirmerReservation`) pour qu'elles appliquent toujours la même règle.
export async function trouverConflitConfirme(
  client: ClientReservations,
  demande: DemandeCreneau,
): Promise<ReservationExistante | null> {
  const confirmees = await client.reservation.findMany({
    where: {
      salleId: demande.salleId,
      statut: "CONFIRMEE",
      debut: { lte: demande.fin },
      fin: { gte: demande.debut },
    },
    select: { id: true, salleId: true, statut: true, debut: true, fin: true },
  });
  return conflitConfirme(demande, confirmees);
}
