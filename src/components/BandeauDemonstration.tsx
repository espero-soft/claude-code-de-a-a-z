import Link from "next/link";
import { IconeInfo } from "./icones";

// Bandeau affiché en haut de chaque page (layout.tsx) : le site est une
// démonstration, Stripe est en mode test (le code refuse toute clé live) et
// les réservations ne sont pas réelles. Détails sur /demonstration.
// Texte en encre sur fond cuivre-clair : contraste suffisant, sans le bouton
// cuivre réservé à « Réserver une salle ».
export function BandeauDemonstration() {
  return (
    <aside
      aria-label="Site de démonstration"
      className="border-b border-cuivre/30 bg-cuivre-clair text-encre"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-petit sm:px-6">
        <span aria-hidden="true" className="shrink-0 text-cuivre-fonce">
          <IconeInfo className="size-4" />
        </span>
        <p>
          <strong>Site de démonstration.</strong> Paiements simulés : aucune somme n&apos;est
          prélevée, et les réservations ne sont pas réelles.
        </p>
        <Link
          href="/demonstration"
          className="inline-flex min-h-11 items-center font-semibold text-cuivre-fonce underline underline-offset-4 hover:no-underline"
        >
          En savoir plus
        </Link>
      </div>
    </aside>
  );
}
