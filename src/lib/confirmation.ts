import { trouverConflitConfirme } from "@/lib/conflit-confirme";
import { prisma } from "@/lib/prisma";

export type ResultatConfirmation =
  | { ok: true }
  | { ok: false; raison: "introuvable" | "pas-en-attente" | "creneau-pris" };

// Passe une réservation EN_ATTENTE à CONFIRMEE (à appeler après le paiement,
// cf. R6), en revérifiant la règle R3 au dernier moment : deux réservations en
// attente sur le même créneau peuvent exister, une seule doit être confirmée.
// La lecture et l'écriture se font dans une même transaction ; l'adaptateur
// better-sqlite3 exécute les transactions l'une après l'autre et SQLite
// n'accepte qu'un écrivain à la fois, donc deux confirmations simultanées ne
// peuvent pas toutes les deux constater un créneau libre.
export async function confirmerReservation(
  id: string,
): Promise<ResultatConfirmation> {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id },
      select: { salleId: true, statut: true, debut: true, fin: true },
    });
    if (!reservation) return { ok: false, raison: "introuvable" };
    if (reservation.statut !== "EN_ATTENTE") {
      return { ok: false, raison: "pas-en-attente" };
    }

    if (await trouverConflitConfirme(tx, reservation)) {
      return { ok: false, raison: "creneau-pris" };
    }

    // Écriture conditionnelle : si la réservation a changé de statut entre la
    // lecture et l'écriture (annulée entre-temps, par exemple), on ne la
    // repasse pas à CONFIRMEE.
    const { count } = await tx.reservation.updateMany({
      where: { id, statut: "EN_ATTENTE" },
      data: { statut: "CONFIRMEE" },
    });
    if (count === 0) return { ok: false, raison: "pas-en-attente" };
    return { ok: true };
  });
}
