"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useState } from "react";
import { IconeFermer, IconeMenu } from "./icones";
import { estActif, LIENS } from "./liens-navigation";
import { Logo } from "./Logo";

// En-tête marine : logo à gauche, liens à droite, lien actif souligné de
// cuivre. Sur mobile, un bouton « Menu » déplie les liens sous la barre.
// Sans état de chemin : sert aussi de fallback du <Suspense> dans le layout,
// tant que le chemin courant n'est pas connu (cheminActif = null).
export function BarreEnTete({ cheminActif }: { cheminActif: string | null }) {
  const [menuOuvert, setMenuOuvert] = useState(false);
  const idMenu = useId();
  const boutonMenu = useRef<HTMLButtonElement>(null);

  return (
    <header className="zone-marine relative z-20 bg-marine text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-3 sm:px-6">
        {/* Le logo reste hors de la <nav> : son nom ne doit pas se confondre
            avec le lien « Accueil » de la navigation. */}
        <Link href="/" className="-my-1 rounded-arrondi-s py-1">
          <Logo variante="clair" className="h-11 w-auto" />
        </Link>

        <nav
          aria-label="Navigation principale"
          onKeyDown={(evenement) => {
            if (evenement.key !== "Escape" || !menuOuvert) return;
            setMenuOuvert(false);
            // Le lien qui avait le focus disparaît avec le menu : le focus
            // revient sur le bouton, sinon il serait perdu (retour en haut de page).
            boutonMenu.current?.focus();
          }}
        >
          <button
            ref={boutonMenu}
            type="button"
            aria-expanded={menuOuvert}
            aria-controls={idMenu}
            onClick={() => setMenuOuvert((ouvert) => !ouvert)}
            className="inline-flex size-11 items-center justify-center rounded-arrondi-s border border-white/30 hover:bg-marine-fonce md:hidden"
          >
            {menuOuvert ? <IconeFermer className="size-6" /> : <IconeMenu className="size-6" />}
            <span className="sr-only">Menu</span>
          </button>

          <ul
            id={idMenu}
            className={`${
              menuOuvert ? "flex" : "hidden"
            } absolute inset-x-0 top-full flex-col border-t border-white/15 bg-marine px-4 py-2 shadow-carte md:static md:flex md:flex-row md:gap-2 md:border-0 md:p-0 md:shadow-none`}
          >
            {LIENS.map(({ href, libelle }) => {
              const actif = estActif(href, cheminActif);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={actif ? "page" : undefined}
                    onClick={() => setMenuOuvert(false)}
                    className={`flex min-h-11 items-center px-3 text-corps font-semibold underline-offset-[10px] hover:underline md:decoration-2 ${
                      actif
                        ? "underline decoration-cuivre-sur-marine decoration-2"
                        : "text-white/85 hover:text-white hover:decoration-white/50"
                    }`}
                  >
                    {libelle}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}

export function EnTete() {
  return <BarreEnTete cheminActif={usePathname()} />;
}
