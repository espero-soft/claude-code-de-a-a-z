import type { ReactNode } from "react";
import { IconeAnnule, IconeHorloge, IconeSucces } from "./icones";

// Badge en pilule, toujours avec un mot (jamais la couleur seule).
// Couleurs d'état : texte blanc sur succes, attente ou erreur, couples
// garantis à 4,5 pour 1 par la charte (les fonds pâles ne le sont pas).
export type TonBadge = "succes" | "attente" | "erreur" | "neutre" | "contour" | "accent";

const TONS: Record<TonBadge, string> = {
  succes: "bg-succes text-white",
  attente: "bg-attente text-white",
  erreur: "bg-erreur text-white",
  neutre: "bg-marine-clair text-marine",
  // Contour marine sur surface (11,6 pour 1) : état à faire, sans couleur d'état.
  contour: "border border-marine bg-surface text-marine",
  // Équipements : fond cuivre-clair, texte cuivre-fonce (6,8 pour 1).
  accent: "bg-cuivre-clair text-cuivre-fonce",
};

const ICONES: Partial<Record<TonBadge, ReactNode>> = {
  succes: <IconeSucces className="size-4" />,
  attente: <IconeHorloge className="size-4" />,
  erreur: <IconeAnnule className="size-4" />,
};

export function Badge({
  ton = "neutre",
  icone,
  children,
}: {
  ton?: TonBadge;
  // Remplace l'icône par défaut du ton ; `null` pour n'en mettre aucune.
  icone?: ReactNode;
  children: ReactNode;
}) {
  const iconeAffichee = icone === undefined ? ICONES[ton] : icone;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-arrondi-pilule px-3 py-1 text-petit font-semibold ${TONS[ton]}`}
    >
      {iconeAffichee}
      {children}
    </span>
  );
}

// Statuts de réservation (enum Prisma StatutReservation) : ton et mot.
const STATUTS = {
  EN_ATTENTE: { ton: "attente", mot: "En attente de paiement" },
  CONFIRMEE: { ton: "succes", mot: "Confirmée" },
  ANNULEE: { ton: "erreur", mot: "Annulée" },
} as const satisfies Record<string, { ton: TonBadge; mot: string }>;

export function BadgeStatut({ statut }: { statut: keyof typeof STATUTS }) {
  const { ton, mot } = STATUTS[statut];
  return <Badge ton={ton}>{mot}</Badge>;
}
