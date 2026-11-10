import { adminDisponible } from "@/lib/admin-tickets";

// Liens de la navigation, partagés par l'en-tête et le pied de page.
// Ajouter un écran à la navigation : une ligne dans ce tableau.
// L'administration n'existe qu'en développement (pas de connexion) : son lien
// n'est pas affiché en production, où la page répond 404.
export const LIENS = [
  { href: "/", libelle: "Accueil" },
  { href: "/salles", libelle: "Nos salles" },
  { href: "/aide", libelle: "Aide" },
  ...(adminDisponible() ? [{ href: "/admin/tickets", libelle: "Tickets" }] : []),
];

// Actif sur la page elle-même, et sur ses sous-routes (sauf l'accueil) :
// « Nos salles » reste actif sur /salles/[id] et /salles/[id]/reserver.
export function estActif(href: string, chemin: string | null): boolean {
  if (chemin === null) return false;
  if (href === "/") return chemin === "/";
  return chemin === href || chemin.startsWith(`${href}/`);
}
