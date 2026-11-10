"use client";

import { useActionState } from "react";
import { payer, type EtatPaiement } from "./actions";

const etatInitial: EtatPaiement = {};

// Le montant n'est pas transmis : la Server Action le relit en base.
export function BoutonPayer({ reservationId }: { reservationId: string }) {
  const [etat, action, enCours] = useActionState(
    payer.bind(null, reservationId),
    etatInitial,
  );

  return (
    <form action={action} className="mt-8 space-y-4">
      {etat.erreur && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {etat.erreur}
        </p>
      )}
      <button
        type="submit"
        disabled={enCours}
        className="inline-flex items-center rounded-full bg-orange-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-wait disabled:opacity-60"
      >
        {enCours ? "Redirection vers le paiement…" : "Payer"}
      </button>
    </form>
  );
}
