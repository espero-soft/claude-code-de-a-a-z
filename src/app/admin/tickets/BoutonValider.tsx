"use client";

import { useActionState } from "react";
import { Bouton } from "@/components/Bouton";
import { Encadre } from "@/components/Encadre";
import { IconeCoche } from "@/components/icones";
import { validerBrouillon, type EtatValidation } from "./actions";

const etatInitial: EtatValidation = {};

// Bouton principal marine (charte : le cuivre est réservé à l'achat).
export function BoutonValider({ ticketId }: { ticketId: string }) {
  const [etat, action, enCours] = useActionState(
    validerBrouillon.bind(null, ticketId),
    etatInitial,
  );

  return (
    <form action={action} className="mt-4 flex flex-col items-stretch gap-3 sm:items-end">
      {etat.erreur && (
        <Encadre ton="erreur" role="alert" className="w-full">
          {etat.erreur}
        </Encadre>
      )}
      <Bouton type="submit" enCours={enCours} libelleEnCours="Validation…">
        <IconeCoche />
        Valider le brouillon
      </Bouton>
    </form>
  );
}
