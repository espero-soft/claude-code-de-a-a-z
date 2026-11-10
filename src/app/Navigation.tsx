"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminDisponible } from "@/lib/admin-tickets";

// Ajouter un écran à la navigation : une ligne dans ce tableau.
// L'administration n'existe qu'en développement (pas de connexion) : son lien
// n'est pas affiché en production, où la page répond 404.
const LIENS = [
  { href: "/", libelle: "Accueil" },
  { href: "/salles", libelle: "Salles" },
  { href: "/aide", libelle: "Aide" },
  ...(adminDisponible() ? [{ href: "/admin/tickets", libelle: "Tickets" }] : []),
];

// Actif sur la page elle-même, et sur ses sous-routes (sauf l'accueil) :
// « Salles » reste actif sur /salles/[id] et /salles/[id]/reserver.
function estActif(href: string, chemin: string | null): boolean {
  if (chemin === null) return false;
  if (href === "/") return chemin === "/";
  return chemin === href || chemin.startsWith(`${href}/`);
}

// Barre sans état : sert aussi de fallback du <Suspense> dans le layout,
// tant que le chemin courant n'est pas connu (cheminActif = null).
export function BarreNavigation({ cheminActif }: { cheminActif: string | null }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <nav
        aria-label="Navigation principale"
        className="mx-auto flex max-w-5xl px-6 py-4"
      >
        <ul className="flex gap-6 text-sm font-medium">
          {LIENS.map(({ href, libelle }) => {
            const actif = estActif(href, cheminActif);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={actif ? "page" : undefined}
                  className={
                    actif
                      ? "text-orange-600"
                      : "text-slate-700 hover:text-orange-600"
                  }
                >
                  {libelle}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}

export function Navigation() {
  return <BarreNavigation cheminActif={usePathname()} />;
}
