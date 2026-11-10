"use server";

import { refresh } from "next/cache";
import { utilisateurAvec } from "@/lib/acces";
import { prisma } from "@/lib/prisma";

export type EtatValidation = { erreur?: string };

// « Valider le brouillon » : le ticket passe de A_TRAITER à VALIDE. Rien n'est
// envoyé au client ; seul le statut change en base.
// L'état précédent passé par useActionState n'est pas utile : non déclaré.
export async function validerBrouillon(ticketId: string): Promise<EtatValidation> {
  // Une Server Action reste appelable en POST sans passer par la page (ni par
  // le proxy, qui ne regarde que le cookie) : session et rôle vérifiés ici.
  if (!(await utilisateurAvec("tickets"))) {
    return { erreur: "Action indisponible." };
  }

  // Condition sur le statut : un ticket déjà validé n'est pas revalidé (sa
  // date de validation ne bouge pas).
  const { count } = await prisma.ticket.updateMany({
    where: { id: ticketId, statut: "A_TRAITER" },
    data: { statut: "VALIDE", valideLe: new Date() },
  });
  if (count === 0) {
    return { erreur: "Ce ticket n'existe plus ou a déjà été validé." };
  }

  refresh();
  return {};
}
