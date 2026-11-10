"use client";

import { useActionState } from "react";
import { Bouton } from "@/components/Bouton";
import { Champ } from "@/components/Champ";
import { IconePersonne } from "@/components/icones";
import { LONGUEUR_MAX_NOM } from "@/lib/profil";
import { modifierNom, type EtatNom } from "./actions";

// Nom du compte : repris sur les réservations faites ensuite (celles déjà
// faites gardent le nom de leur réservation).
export function FormulaireNom({ nom }: { nom: string }) {
  const [etat, action, enCours] = useActionState(modifierNom, {} satisfies EtatNom);

  return (
    <form action={action} noValidate className="space-y-4">
      <Champ
        id="nom"
        libelle="Votre nom"
        aide="Affiché sur vos prochaines réservations."
        icone={<IconePersonne />}
        type="text"
        autoComplete="name"
        maxLength={LONGUEUR_MAX_NOM}
        required
        defaultValue={etat.valeur ?? nom}
        erreur={etat.erreur}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Bouton type="submit" enCours={enCours} libelleEnCours="Enregistrement…">
          Enregistrer mon nom
        </Bouton>
        <p role="status" className="text-petit font-semibold text-succes">
          {!enCours && etat.succes}
        </p>
      </div>
    </form>
  );
}
