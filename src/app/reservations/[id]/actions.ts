"use server";

import { redirect } from "next/navigation";
import { lireTitulaireReservation, lireUtilisateur } from "@/lib/acces";
import { adressePublique } from "@/lib/configuration";
import { peutPayerReservation } from "@/lib/roles";
import { ouvrirPaiement, RESERVATION_INEXISTANTE } from "@/lib/suivi-paiement";

export type EtatPaiement = { erreur?: string };

// Bouton « Payer » : envoie le client sur Stripe Checkout, ou sur la page de
// la réservation si elle n'est plus à payer (R6).
// L'état précédent passé par useActionState n'est pas utile : non déclaré.
export async function payer(reservationId: string): Promise<EtatPaiement> {
  // Une Server Action s'appelle en POST sans passer par la page : la session
  // et le titulaire sont vérifiés ici, avant toute lecture ou écriture.
  // Visiteur, autre client ou personnel : même réponse qu'une réservation
  // inexistante.
  const utilisateur = await lireUtilisateur();
  const reservation = utilisateur ? await lireTitulaireReservation(reservationId) : null;
  if (!reservation || !peutPayerReservation(utilisateur, reservation)) {
    return { erreur: RESERVATION_INEXISTANTE };
  }

  let url: string;
  try {
    // Adresse de retour après le paiement : l'adresse publique configurée
    // (BETTER_AUTH_URL), jamais un en-tête de la requête.
    const origine = adressePublique(process.env);
    const resultat = await ouvrirPaiement(reservationId, origine, new Date());
    if (!resultat.ok) return { erreur: resultat.erreur };
    url = resultat.url;
  } catch (erreur) {
    console.error("Paiement impossible", erreur);
    return {
      erreur: "Le paiement est momentanément indisponible. Réessayez dans quelques instants.",
    };
  }
  // redirect lève une exception : hors du try.
  redirect(url);
}
