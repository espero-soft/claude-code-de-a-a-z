"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Bouton } from "@/components/Bouton";
import { Champ } from "@/components/Champ";
import { Encadre } from "@/components/Encadre";
import {
  confirmerSuppression,
  demanderCodeSuppression,
  type EtatSuppression,
} from "./actions";

const etatInitial: EtatSuppression = { etape: "debut" };

// Deux étapes : recevoir un nouveau code par e-mail, puis le saisir. Le
// bouton rouge n'apparaît qu'à la seconde, avec le code.
// `refus` : décidé par le serveur (dernier administrateur, second facteur
// du personnel) ; les actions le revérifient de toute façon.
export function SuppressionCompte({ refus }: { refus: string | null }) {
  const [etat, action, enCours] = useActionState(
    async (precedent: EtatSuppression, donnees: FormData) =>
      donnees.get("intention") === "confirmer"
        ? confirmerSuppression(precedent, donnees)
        : demanderCodeSuppression(),
    etatInitial,
  );
  // « Annuler » revient au début sans appeler le serveur.
  const [annule, setAnnule] = useState<EtatSuppression | null>(null);
  const affiche = annule === etat ? etatInitial : etat;

  if (refus) {
    return (
      <Encadre ton="alerte" titre="Suppression impossible pour l'instant">
        {refus}
        {refus.includes("second facteur") && (
          <>
            {" "}
            <Link href="/double-authentification?retour=%2Fprofil" className="font-semibold underline">
              Valider mon second facteur
            </Link>
          </>
        )}
      </Encadre>
    );
  }

  if (affiche.etape === "debut") {
    return (
      <form action={action} className="space-y-4">
        {affiche.erreur && (
          <Encadre ton="erreur" role="alert">
            {affiche.erreur}
          </Encadre>
        )}
        <input type="hidden" name="intention" value="demander" />
        <Bouton type="submit" variante="secondaire" enCours={enCours} libelleEnCours="Envoi du code…">
          Recevoir un code pour supprimer mon compte
        </Bouton>
      </form>
    );
  }

  return (
    <form action={action} noValidate className="space-y-4">
      <Encadre ton="alerte" role="status" titre="Dernière étape">
        Nous venons d&apos;envoyer un code à 6 chiffres à <strong>{affiche.envoyeA}</strong>. Il est
        valable 5 minutes, sur cet appareil seulement.
      </Encadre>
      <Champ
        id="code-suppression"
        name="code"
        libelle="Code reçu par e-mail"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        required
        defaultValue={affiche.valeur}
        erreur={affiche.erreur}
        className="font-mono tracking-widest"
      />
      {/* Le bouton cliqué dit l'intention ; Entrée dans le champ confirme
          (premier bouton d'envoi du formulaire). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Bouton
          type="submit"
          name="intention"
          value="confirmer"
          variante="danger"
          enCours={enCours}
          libelleEnCours="Patientez…"
        >
          Supprimer définitivement mon compte
        </Bouton>
        <Bouton type="submit" name="intention" value="demander" variante="secondaire" disabled={enCours}>
          Recevoir un nouveau code
        </Bouton>
        <Bouton type="button" variante="secondaire" disabled={enCours} onClick={() => setAnnule(etat)}>
          Annuler
        </Bouton>
      </div>
    </form>
  );
}
