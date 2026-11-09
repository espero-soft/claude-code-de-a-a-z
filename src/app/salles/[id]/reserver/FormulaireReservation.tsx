"use client";

import { useActionState } from "react";
import type { SaisieReservation } from "@/lib/reservation";
import { reserver, type EtatFormulaire } from "./actions";

const etatInitial: EtatFormulaire = {
  erreurs: {},
  valeurs: { date: "", heureDebut: "", heureFin: "", nomClient: "", emailClient: "" },
};

export function FormulaireReservation({
  salleId,
  aujourdhui,
}: {
  salleId: string;
  // Date du jour à Paris (AAAA-MM-JJ), pour griser les jours passés.
  aujourdhui: string;
}) {
  const [etat, action, enCours] = useActionState(
    reserver.bind(null, salleId),
    etatInitial,
  );

  return (
    <form
      action={action}
      noValidate
      className="mt-8 space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      {etat.erreurs.general && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {etat.erreurs.general}
        </p>
      )}

      <Champ etat={etat} nom="date" libelle="Date" type="date" min={aujourdhui} />

      <div className="grid gap-6 sm:grid-cols-2">
        <Champ
          etat={etat}
          nom="heureDebut"
          libelle="Heure de début"
          type="time"
          min="08:00"
          max="19:00"
          step={1800}
        />
        <Champ
          etat={etat}
          nom="heureFin"
          libelle="Heure de fin"
          type="time"
          min="09:00"
          max="20:00"
          step={1800}
        />
      </div>

      <Champ etat={etat} nom="nomClient" libelle="Votre nom" type="text" autoComplete="name" />
      <Champ
        etat={etat}
        nom="emailClient"
        libelle="Votre adresse e-mail"
        type="email"
        autoComplete="email"
      />

      <button
        type="submit"
        disabled={enCours}
        className="inline-flex items-center rounded-full bg-orange-600 px-6 py-3 text-lg font-semibold text-white shadow-sm transition hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:opacity-60"
      >
        {enCours ? "Envoi en cours…" : "Envoyer la demande"}
      </button>
    </form>
  );
}

function Champ({
  etat,
  nom,
  libelle,
  ...attributs
}: {
  etat: EtatFormulaire;
  nom: keyof SaisieReservation;
  libelle: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const erreur = etat.erreurs[nom];
  const idErreur = `${nom}-erreur`;

  return (
    <div>
      <label htmlFor={nom} className="block text-sm font-medium text-slate-700">
        {libelle}
      </label>
      <input
        id={nom}
        name={nom}
        required
        defaultValue={etat.valeurs[nom]}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={erreur ? idErreur : undefined}
        className={`mt-1 block w-full rounded-lg border px-3 py-2 text-slate-900 shadow-sm focus:outline-2 focus:outline-orange-600 ${
          erreur ? "border-red-500" : "border-slate-300"
        }`}
        {...attributs}
      />
      {erreur && (
        <p id={idErreur} className="mt-1 text-sm text-red-600">
          {erreur}
        </p>
      )}
    </div>
  );
}
