import Link from "next/link";
import { IconeCalendrier } from "./icones";
import { LIENS } from "./liens-navigation";

// Pied de page marine : navigation, horaires, et la seule mention
// « Centre de démonstration : projet de formation ». Charte : aucune
// adresse, aucun téléphone, aucun e-mail, aucun réseau social.
export function PiedDePage() {
  return (
    <footer className="zone-marine mt-auto bg-marine-fonce text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <nav aria-label="Navigation du pied de page">
          <ul className="flex flex-wrap gap-x-2 gap-y-1">
            {LIENS.map(({ href, libelle }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex min-h-11 items-center px-2 font-semibold text-white/90 underline-offset-4 hover:text-white hover:underline md:first:pl-0"
                >
                  {libelle}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-2 text-petit text-white/85 md:text-right">
          <p className="flex items-center gap-2 md:justify-end">
            <IconeCalendrier className="size-4 shrink-0" />
            Du lundi au vendredi, de 8 h à 20 h
          </p>
          <p>Centre de démonstration : projet de formation</p>
        </div>
      </div>
    </footer>
  );
}
