"use client";

import { useActionState } from "react";
import { Bouton } from "@/components/Bouton";
import { deconnecterAppareil, deconnecterAutresAppareils, type EtatAppareils } from "./actions";

// Boutons de la liste « Appareils connectés ». Après l'action, la page est
// relue côté serveur (refresh dans l'action) : l'appareil disparaît.

function Message({ etat }: { etat: EtatAppareils }) {
  if (etat.erreur) {
    return (
      <p role="alert" className="text-petit text-erreur">
        {etat.erreur}
      </p>
    );
  }
  return (
    <p role="status" className="text-petit font-semibold text-succes">
      {etat.succes}
    </p>
  );
}

export function BoutonDeconnecterAppareil({ sessionId, libelle }: { sessionId: string; libelle: string }) {
  const [etat, action, enCours] = useActionState(
    () => deconnecterAppareil(sessionId),
    {} satisfies EtatAppareils,
  );
  return (
    <form action={action} className="flex flex-col items-start gap-1 sm:items-end">
      <Bouton type="submit" variante="secondaire" enCours={enCours} libelleEnCours="Déconnexion…">
        Déconnecter
        <span className="sr-only"> : {libelle}</span>
      </Bouton>
      <Message etat={etat} />
    </form>
  );
}

export function BoutonDeconnecterAutres({ nombre }: { nombre: number }) {
  const [etat, action, enCours] = useActionState(
    () => deconnecterAutresAppareils(),
    {} satisfies EtatAppareils,
  );
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Bouton type="submit" variante="principal" enCours={enCours} libelleEnCours="Déconnexion…">
        {nombre > 1 ? `Déconnecter les ${nombre} autres appareils` : "Déconnecter l'autre appareil"}
      </Bouton>
      <Message etat={etat} />
    </form>
  );
}
