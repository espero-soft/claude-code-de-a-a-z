import { LienBouton } from "@/components/Bouton";
import { IconeFleche } from "@/components/icones";

// Affichée pour une salle inconnue ou désactivée : via /salles/introuvable
// (réécriture du proxy) ou quand la fiche appelle notFound().
// Maquette 05 : grand « 404 » pâle, titre, texte, bouton avec flèche. Le
// bouton est marine (principal) : ce n'est pas un achat, le cuivre est
// réservé à réserver et payer. Le centre ne loue que des salles de réunion.
export default function SalleIntrouvable() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-4 py-12 sm:px-6 md:py-20">
      <div className="max-w-xl">
        <p
          aria-hidden="true"
          className="font-titres text-[96px] leading-none font-bold text-bordure md:text-[144px]"
        >
          404
        </p>
        <h1 className="mt-2 text-titre-1 text-marine">Salle introuvable</h1>
        <span aria-hidden="true" className="mt-4 block h-1 w-16 rounded-full bg-cuivre" />
        <p className="mt-6 text-lg leading-7 text-encre">
          Cette salle n&apos;existe pas ou n&apos;est plus proposée à la location.
        </p>
        <p className="mt-3 text-lg leading-7 text-encre-douce">
          Découvrez nos autres salles de réunion.
        </p>
        <LienBouton href="/salles" className="mt-8 w-full sm:w-auto">
          Voir toutes les salles
          <IconeFleche />
        </LienBouton>
      </div>
    </main>
  );
}
