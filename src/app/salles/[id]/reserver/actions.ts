"use server";

import { redirect } from "next/navigation";
import { calculerMontant } from "@/lib/montant";
import { prisma } from "@/lib/prisma";
import {
  validerReservation,
  type ErreursReservation,
  type SaisieReservation,
} from "@/lib/reservation";

export type EtatFormulaire = {
  erreurs: ErreursReservation;
  // Renvoyées pour ne pas vider le formulaire après une erreur.
  valeurs: SaisieReservation;
};

export async function reserver(
  salleId: string,
  _etatPrecedent: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lire = (nom: string) => {
    const valeur = formData.get(nom);
    return typeof valeur === "string" ? valeur : "";
  };
  const valeurs: SaisieReservation = {
    date: lire("date"),
    heureDebut: lire("heureDebut"),
    heureFin: lire("heureFin"),
    nomClient: lire("nomClient"),
    emailClient: lire("emailClient"),
  };

  const resultat = validerReservation(valeurs, new Date());
  if (!resultat.ok) {
    return { erreurs: resultat.erreurs, valeurs };
  }

  // Le prix vient de la base, jamais du formulaire.
  const salle = await prisma.salle.findFirst({
    where: { id: salleId, active: true },
    select: { id: true, prixHeureCentimes: true },
  });
  if (!salle) {
    return {
      erreurs: { general: "Cette salle n'est plus proposée à la location." },
      valeurs,
    };
  }

  const reservation = await prisma.reservation.create({
    data: {
      salleId: salle.id,
      debut: resultat.debut,
      fin: resultat.fin,
      nomClient: resultat.nomClient,
      emailClient: resultat.emailClient,
      statut: "EN_ATTENTE",
      // Règle R5.
      montantTotalCentimes: calculerMontant(
        salle.prixHeureCentimes,
        resultat.debut,
        resultat.fin,
      ),
    },
    select: { id: true },
  });

  redirect(`/reservations/${reservation.id}`);
}
