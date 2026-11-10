"use client";

import { useActionState } from "react";
import { validerBrouillon, type EtatValidation } from "./actions";

const etatInitial: EtatValidation = {};

export function BoutonValider({ ticketId }: { ticketId: string }) {
  const [etat, action, enCours] = useActionState(
    validerBrouillon.bind(null, ticketId),
    etatInitial,
  );

  return (
    <form action={action} className="mt-4 space-y-3">
      {etat.erreur && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {etat.erreur}
        </p>
      )}
      <button
        type="submit"
        disabled={enCours}
        className="inline-flex items-center rounded-full bg-orange-600 px-5 py-2 font-semibold text-white shadow-sm transition hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-wait disabled:opacity-60"
      >
        {enCours ? "Validation…" : "Valider le brouillon"}
      </button>
    </form>
  );
}
