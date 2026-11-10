"use server";

import { redirect } from "next/navigation";
import { utilisateurAvec } from "@/lib/acces";
import { messageCreneauPris } from "@/lib/chevauchement";
import { trouverConflitConfirme } from "@/lib/conflit-confirme";
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
  // Une Server Action s'appelle en POST sans passer par la page : la session
  // est vérifiée ici. La réservation est rattachée au compte (titulaire).
  const utilisateur = await utilisateurAvec("reserver");

  // Le nom et l'e-mail viennent du compte, jamais du formulaire : l'e-mail
  // est celui vérifié par le code de connexion. Seul un compte encore sans
  // nom (créé par le code) envoie « nomClient », enregistré ensuite.
  const nomCompte = utilisateur?.nom.trim() ?? "";
  const valeurs: SaisieReservation = {
    date: lire("date"),
    heureDebut: lire("heureDebut"),
    heureFin: lire("heureFin"),
    nomClient: nomCompte || lire("nomClient"),
    emailClient: utilisateur?.email ?? "",
  };

  if (!utilisateur) {
    return { erreurs: { general: "Connectez-vous pour réserver une salle." }, valeurs };
  }

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

  // Règle R3 : seules les réservations confirmées bloquent le créneau.
  const conflit = await trouverConflitConfirme(prisma, {
    salleId: salle.id,
    debut: resultat.debut,
    fin: resultat.fin,
  });
  if (conflit) {
    return { erreurs: { general: messageCreneauPris(conflit) }, valeurs };
  }

  const reservation = await prisma.reservation.create({
    data: {
      salleId: salle.id,
      utilisateurId: utilisateur.id,
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

  // Premier nom saisi : gardé dans le compte, il ne sera plus demandé.
  if (!nomCompte) {
    await prisma.user.update({
      where: { id: utilisateur.id },
      data: { name: resultat.nomClient },
    });
  }

  redirect(`/reservations/${reservation.id}`);
}
