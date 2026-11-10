"use client";

import { useActionState } from "react";
import { Bouton } from "@/components/Bouton";
import { Champ } from "@/components/Champ";
import { validerCode, type EtatCode } from "./actions";

const etatInitial: EtatCode = {};

// Saisie d'un code (application ou secours), commune à l'enrôlement et à la
// vérification. `key` côté parent : changer de mode remet le champ à zéro.
export function FormulaireCode({
  retour,
  mode,
  libelleBouton,
}: {
  retour: string;
  mode: "totp" | "secours";
  libelleBouton: string;
}) {
  const [etat, action, enCours] = useActionState(validerCode.bind(null, retour, mode), etatInitial);
  const totp = mode === "totp";

  return (
    <form action={action} noValidate className="space-y-4">
      <Champ
        id="code"
        libelle={totp ? "Code à 6 chiffres de l'application" : "Code de secours"}
        aide={
          totp
            ? "Le code change toutes les 30 secondes."
            : "L'un des 10 codes notés à la configuration ; chacun ne sert qu'une fois."
        }
        type="text"
        inputMode={totp ? "numeric" : "text"}
        autoComplete="one-time-code"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={totp ? 7 : 12}
        required
        defaultValue={etat.valeur}
        erreur={etat.erreur}
        className="font-mono tracking-widest"
      />
      <Bouton type="submit" enCours={enCours} libelleEnCours="Vérification…" pleineLargeur>
        {libelleBouton}
      </Bouton>
    </form>
  );
}
