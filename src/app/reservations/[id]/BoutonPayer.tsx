"use client";

import { useActionState } from "react";
import { Bouton, type VarianteBouton } from "@/components/Bouton";
import { Encadre } from "@/components/Encadre";
import { IconeCarteBancaire } from "@/components/icones";
import { payer, type EtatPaiement } from "./actions";

const etatInitial: EtatPaiement = {};

// Le montant affiché (« Payer 60,00 € », charte) est un simple libellé : la
// Server Action ne le reçoit pas et relit le montant en base (R5).
export function BoutonPayer({
  reservationId,
  montant,
  variante = "action",
  libelle = "Payer",
  pleineLargeur = true,
  className = "mt-6",
}: {
  reservationId: string;
  montant: string;
  // Cuivre par défaut (charte : l'action qui fait avancer). Marine dans
  // l'espace client, où le cuivre est déjà pris par « Réserver une salle »
  // (un seul bouton cuivre par écran).
  variante?: VarianteBouton;
  libelle?: string;
  pleineLargeur?: boolean;
  className?: string;
}) {
  const [etat, action, enCours] = useActionState(
    payer.bind(null, reservationId),
    etatInitial,
  );

  return (
    <form action={action} className={`space-y-4 ${className}`}>
      {etat.erreur && (
        <Encadre ton="erreur" role="alert">
          {etat.erreur}
        </Encadre>
      )}
      <Bouton
        type="submit"
        variante={variante}
        pleineLargeur={pleineLargeur}
        enCours={enCours}
        libelleEnCours="Redirection vers le paiement…"
      >
        <IconeCarteBancaire />
        {libelle} {montant}
      </Bouton>
    </form>
  );
}
