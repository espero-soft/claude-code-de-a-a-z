import type { ReactNode } from "react";
import { IconeAlerte, IconeErreur, IconeInfo } from "./icones";

// Encadré de message : information (marine-clair), alerte (attente),
// erreur (erreur). La couleur du ton est portée par l'icône et la bordure ;
// titre et texte restent en encre : la couleur d'état sur son propre fond
// pâle descend sous 4,5 pour 1 (attente : environ 4,3).
export type TonEncadre = "information" | "alerte" | "erreur";

const TONS: Record<TonEncadre, { cadre: string; accent: string; icone: ReactNode }> = {
  information: {
    cadre: "border-marine/25 bg-marine-clair",
    accent: "text-marine",
    icone: <IconeInfo />,
  },
  alerte: {
    cadre: "border-attente/40 bg-attente/10",
    accent: "text-attente",
    icone: <IconeAlerte />,
  },
  erreur: {
    cadre: "border-erreur/40 bg-erreur/10",
    accent: "text-erreur",
    icone: <IconeErreur />,
  },
};

export function Encadre({
  ton = "information",
  titre,
  role,
  className = "",
  children,
}: {
  ton?: TonEncadre;
  titre?: string;
  // `alert` pour un message qui apparaît après une action (erreur renvoyée
  // par une Server Action) et doit être annoncé par les lecteurs d'écran.
  role?: "alert" | "status";
  className?: string;
  children: ReactNode;
}) {
  const { cadre, accent, icone } = TONS[ton];
  return (
    <div
      role={role}
      className={`flex items-start gap-3 rounded-arrondi-m border p-4 text-petit text-encre ${cadre} ${className}`}
    >
      <span className={`shrink-0 ${accent}`}>{icone}</span>
      <div>
        {titre && <p className="font-bold">{titre}</p>}
        <div className={titre ? "mt-0.5" : ""}>{children}</div>
      </div>
    </div>
  );
}
