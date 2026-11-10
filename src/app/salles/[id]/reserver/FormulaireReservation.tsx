"use client";

import { useActionState, useEffect, useRef } from "react";
import { Bouton } from "@/components/Bouton";
import { Champ, ChampListe } from "@/components/Champ";
import { Encadre } from "@/components/Encadre";
import {
  IconeCalendrier,
  IconeEnveloppe,
  IconeHorloge,
  IconePersonne,
} from "@/components/icones";
import { reserver, type EtatFormulaire } from "./actions";

const etatInitial: EtatFormulaire = {
  erreurs: {},
  valeurs: { date: "", heureDebut: "", heureFin: "", nomClient: "", emailClient: "" },
};

// Heures de 30 en 30 minutes (plan de refonte) : début de 8 h à 19 h, fin de
// 9 h à 20 h. La valeur envoyée garde le format « 09:30 » attendu par
// validerReservation, seule autorité sur R1 et R2 ; le libellé suit la
// charte (« 9 h », « 9 h 30 »).
function creneaux(depuisMin: number, jusquaMin: number) {
  const liste: { valeur: string; libelle: string }[] = [];
  for (let m = depuisMin; m <= jusquaMin; m += 30) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    liste.push({
      valeur: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`,
      libelle: min === 0 ? `${h} h` : `${h} h ${min}`,
    });
  }
  return liste;
}
const HEURES_DEBUT = creneaux(8 * 60, 19 * 60);
const HEURES_FIN = creneaux(9 * 60, 20 * 60);

export function FormulaireReservation({
  salleId,
  aujourdhui,
  compte,
}: {
  salleId: string;
  // Date du jour à Paris (AAAA-MM-JJ), pour griser les jours passés.
  aujourdhui: string;
  // Compte connecté : la réservation est faite à son nom et à son e-mail.
  // Nom vide (compte créé par le code) : demandé une seule fois.
  compte: { nom: string; email: string };
}) {
  const [etat, action, enCours] = useActionState(
    reserver.bind(null, salleId),
    etatInitial,
  );
  const formulaire = useRef<HTMLFormElement>(null);

  // Après un envoi refusé, place le focus sur le premier champ en erreur
  // (ou sur l'encadré du créneau pris) : sur mobile, il peut être hors écran.
  useEffect(() => {
    if (etat === etatInitial) return;
    const cible = formulaire.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"], [data-erreur-generale]',
    );
    cible?.focus();
  }, [etat]);

  const { erreurs, valeurs } = etat;

  return (
    <form ref={formulaire} action={action} noValidate className="space-y-6">
      {/* `required` n'est annoncé qu'aux lecteurs d'écran : on le dit à tous. */}
      <p className="text-petit text-encre-douce">Tous les champs sont obligatoires.</p>
      <Champ
        id="date"
        libelle="Date"
        type="date"
        min={aujourdhui}
        required
        defaultValue={valeurs.date}
        erreur={erreurs.date}
        icone={<IconeCalendrier />}
      />

      <div className="space-y-4">
        <div className="grid gap-6 sm:grid-cols-2">
          {/* key : React ne réapplique pas defaultValue à une liste déjà
              montée ; la remonter garde l'heure saisie après une erreur. */}
          <ChampListe
            key={`debut-${valeurs.heureDebut}`}
            id="heureDebut"
            libelle="Heure de début"
            required
            defaultValue={valeurs.heureDebut}
            erreur={erreurs.heureDebut}
            icone={<IconeHorloge />}
          >
            <option value="">Choisir</option>
            {HEURES_DEBUT.map(({ valeur, libelle }) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </ChampListe>
          <ChampListe
            key={`fin-${valeurs.heureFin}`}
            id="heureFin"
            libelle="Heure de fin"
            required
            defaultValue={valeurs.heureFin}
            erreur={erreurs.heureFin}
            icone={<IconeHorloge />}
          >
            <option value="">Choisir</option>
            {HEURES_FIN.map(({ valeur, libelle }) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </ChampListe>
        </div>

        {/* Erreur générale de la Server Action : surtout le créneau déjà pris
            (R3), d'où sa place sous les heures. */}
        {erreurs.general && (
          <div tabIndex={-1} data-erreur-generale className="rounded-arrondi-m">
            <Encadre ton="erreur" role="alert">
              {erreurs.general}
            </Encadre>
          </div>
        )}
      </div>

      {/* Nom et e-mail viennent du compte (la Server Action les relit) :
          plus rien à ressaisir, sauf le nom d'un compte qui n'en a pas. */}
      {compte.nom ? null : (
        <Champ
          id="nomClient"
          libelle="Votre nom"
          aide="Enregistré dans votre compte : il ne vous sera plus demandé."
          type="text"
          autoComplete="name"
          required
          defaultValue={valeurs.nomClient}
          erreur={erreurs.nomClient}
          icone={<IconePersonne />}
        />
      )}
      <div className="rounded-arrondi-m bg-fond px-4 py-3">
        <p className="text-petit text-encre-douce">Réservation au nom de</p>
        <dl className="mt-2 space-y-1">
          {compte.nom && (
            <div className="flex items-center gap-2">
              <dt className="text-encre-douce">
                <IconePersonne />
                <span className="sr-only">Nom</span>
              </dt>
              <dd className="font-semibold break-words">{compte.nom}</dd>
            </div>
          )}
          <div className="flex items-center gap-2">
            <dt className="text-encre-douce">
              <IconeEnveloppe />
              <span className="sr-only">E-mail</span>
            </dt>
            <dd className="font-semibold break-all">{compte.email}</dd>
          </div>
        </dl>
      </div>

      <Bouton type="submit" variante="action" enCours={enCours} pleineLargeur>
        Envoyer la demande
      </Bouton>
    </form>
  );
}
