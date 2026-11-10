// Liens de la navigation, partagés par l'en-tête et le pied de page.
// Ajouter un écran à la navigation : une ligne dans ce tableau.
export const LIENS = [
  { href: "/", libelle: "Accueil" },
  { href: "/salles", libelle: "Nos salles" },
  { href: "/aide", libelle: "Aide" },
];

// Lien réservé au personnel (employé, administrateur), ajouté dans l'en-tête
// par ZoneCompte selon le rôle lu côté serveur. Simple confort d'affichage :
// la page et ses actions revérifient le rôle.
export const LIEN_ADMINISTRATION = { href: "/admin/tickets", libelle: "Tickets" };

// Actif sur la page elle-même, et sur ses sous-routes (sauf l'accueil) :
// « Nos salles » reste actif sur /salles/[id] et /salles/[id]/reserver.
export function estActif(href: string, chemin: string | null): boolean {
  if (chemin === null) return false;
  if (href === "/") return chemin === "/";
  return chemin === href || chemin.startsWith(`${href}/`);
}
