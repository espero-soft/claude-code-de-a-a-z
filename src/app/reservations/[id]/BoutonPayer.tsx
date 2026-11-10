"use client";

import { useActionState } from "react";
import { Bouton } from "@/components/Bouton";
import { Encadre } from "@/components/Encadre";
import { IconeCarteBancaire } from "@/components/icones";
import { payer, type EtatPaiement } from "./actions";

const etatInitial: EtatPaiement = {};

// Le montant affiché (« Payer 60,00 € », charte) est un simple libellé : la
// Server Action ne le reçoit pas et relit le montant en base (R5).
export function BoutonPayer({
  reservationId,
  montant,
}: {
  reservationId: string;
  montant: string;
}) {
  const [etat, action, enCours] = useActionState(
    payer.bind(null, reservationId),
    etatInitial,
  );

  return (
    <form action={action} className="mt-6 space-y-4">
      {etat.erreur && (
        <Encadre ton="erreur" role="alert">
          {etat.erreur}
        </Encadre>
      )}
      <Bouton
        type="submit"
        variante="action"
        pleineLargeur
        enCours={enCours}
        libelleEnCours="Redirection vers le paiement…"
      >
        <IconeCarteBancaire />
        Payer {montant}
      </Bouton>
    </form>
  );
}
