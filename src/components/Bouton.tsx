import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { IconeChargement } from "./icones";

// Charte : « principal » marine (action sans achat), « action » cuivre
// (réserver, payer : jamais plus d'un par écran), « secondaire » contour
// marine, « danger » rouge `erreur` (action irréversible : supprimer son
// compte ; texte blanc à 6,5 pour 1). Hauteur 48 px, pilule.
export type VarianteBouton = "principal" | "action" | "secondaire" | "danger";

const BASE =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-arrondi-pilule px-6 text-corps font-semibold transition-colors";

const VARIANTES: Record<VarianteBouton, string> = {
  principal: "bg-marine text-white hover:bg-marine-fonce",
  action: "bg-cuivre text-white hover:bg-cuivre-fonce",
  secondaire: "border-2 border-marine bg-surface text-marine hover:bg-marine-clair",
  danger: "bg-erreur text-white hover:bg-erreur/90",
};

// Désactivé : lisible (encre-douce sur marine-clair, 5,1 pour 1), mais sans
// la couleur de la variante pour ne pas inviter au clic.
const DESACTIVE = "cursor-not-allowed bg-marine-clair text-encre-douce";

// Classes d'un bouton, aussi pour un lien qui en a l'apparence (LienBouton).
export function classesBouton(
  variante: VarianteBouton = "principal",
  etat: "normal" | "desactive" | "en-cours" = "normal",
): string {
  if (etat === "desactive") return `${BASE} ${DESACTIVE}`;
  // En cours : garde sa couleur (l'action continue), sans effet de survol.
  if (etat === "en-cours") return `${BASE} ${VARIANTES[variante]} cursor-wait opacity-90`;
  return `${BASE} ${VARIANTES[variante]}`;
}

type PropsBouton = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: VarianteBouton;
  // État « en cours » (par exemple `pending` de useActionState) : bouton
  // désactivé, indicateur tournant et libellé d'attente.
  enCours?: boolean;
  libelleEnCours?: string;
  pleineLargeur?: boolean;
};

export function Bouton({
  variante = "principal",
  enCours = false,
  libelleEnCours = "Envoi en cours…",
  pleineLargeur = false,
  disabled,
  type = "button",
  className = "",
  children,
  ...props
}: PropsBouton) {
  const etat = enCours ? "en-cours" : disabled ? "desactive" : "normal";
  return (
    <button
      type={type}
      disabled={disabled || enCours}
      aria-busy={enCours || undefined}
      className={`${classesBouton(variante, etat)} ${pleineLargeur ? "w-full" : ""} ${className}`}
      {...props}
    >
      {enCours ? (
        <>
          <IconeChargement />
          {libelleEnCours}
        </>
      ) : (
        children
      )}
    </button>
  );
}

type PropsLienBouton = ComponentProps<typeof Link> & {
  variante?: VarianteBouton;
  pleineLargeur?: boolean;
};

export function LienBouton({
  variante = "principal",
  pleineLargeur = false,
  className = "",
  ...props
}: PropsLienBouton) {
  return (
    <Link
      className={`${classesBouton(variante)} ${pleineLargeur ? "w-full" : ""} ${className}`}
      {...props}
    />
  );
}
