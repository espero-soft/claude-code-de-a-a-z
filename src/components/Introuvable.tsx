import type { ReactNode } from "react";
import { LienBouton } from "./Bouton";
import { IconeFleche } from "./icones";

// Page 404 au design Réunéa (maquette 05) : grand « 404 » pâle, titre à trait
// cuivre, texte, bouton marine avec flèche (le cuivre est réservé à réserver
// et payer). Partagée par la page introuvable générale (app/not-found.tsx) et
// celle des salles (app/salles/not-found.tsx).
export function Introuvable({
  titre,
  lien,
  children,
}: {
  titre: string;
  lien: { href: string; texte: string };
  children: ReactNode;
}) {
  return (
    <main id="contenu" className="mx-auto flex w-full max-w-6xl flex-1 items-center px-4 py-12 sm:px-6 md:py-20">
      <div className="max-w-xl">
        <p
          aria-hidden="true"
          // bordure-forte : pâle mais lisible (3,3 pour 1, grand texte).
          className="font-titres text-[96px] leading-none font-bold text-bordure-forte md:text-[144px]"
        >
          404
        </p>
        <h1 className="mt-2 text-titre-1 text-marine">{titre}</h1>
        <span aria-hidden="true" className="mt-4 block h-1 w-16 rounded-full bg-cuivre" />
        <div className="mt-6 space-y-3 text-lg leading-7 text-encre">{children}</div>
        <LienBouton href={lien.href} className="mt-8 w-full sm:w-auto">
          {lien.texte}
          <IconeFleche />
        </LienBouton>
      </div>
    </main>
  );
}
