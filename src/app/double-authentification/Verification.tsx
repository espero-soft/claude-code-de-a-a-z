"use client";

import { useState } from "react";
import { Carte } from "@/components/Carte";
import { FormulaireCode } from "./FormulaireCode";

// Personnel déjà enrôlé : un code de l'application, ou à défaut un code de
// secours (téléphone perdu ou oublié).
export function Verification({ retour }: { retour: string }) {
  const [mode, setMode] = useState<"totp" | "secours">("totp");

  return (
    <Carte className="mt-8 sm:p-8">
      <h2 className="text-titre-3 text-marine">
        {mode === "totp" ? "Code de l'application" : "Code de secours"}
      </h2>
      <div className="mt-4">
        <FormulaireCode key={mode} retour={retour} mode={mode} libelleBouton="Valider" />
      </div>
      <button
        type="button"
        onClick={() => setMode(mode === "totp" ? "secours" : "totp")}
        className="mt-4 inline-flex min-h-11 items-center rounded-arrondi-s font-semibold text-marine underline underline-offset-4 hover:text-marine-fonce"
      >
        {mode === "totp" ? "Utiliser un code de secours" : "Utiliser l'application"}
      </button>
    </Carte>
  );
}
