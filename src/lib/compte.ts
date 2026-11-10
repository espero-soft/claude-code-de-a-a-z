import { cache } from "react";
import { lireUtilisateur } from "@/lib/acces";
import { initialeCompte } from "@/lib/connexion";
import { estPersonnel } from "@/lib/roles";

export type CompteConnecte = { email: string; initiale: string; personnel: boolean };

// Compte de la requête en cours, ou null pour un visiteur. Lit le cookie de
// session : à appeler dans un composant sous <Suspense> (Cache Components),
// jamais dans un "use cache". cache() évite de relire la session quand
// l'en-tête et la page en ont besoin dans la même requête.
// Ne renvoie que ce que l'interface affiche (pas le jeton de session).
// `personnel` sert seulement à afficher le lien « Tickets » : chaque page et
// chaque action de /admin revérifie le rôle (src/lib/acces.ts).
export const lireCompte = cache(async (): Promise<CompteConnecte | null> => {
  const utilisateur = await lireUtilisateur();
  if (!utilisateur) return null;
  const { email, nom, role } = utilisateur;
  return { email, initiale: initialeCompte(nom, email), personnel: estPersonnel(role) };
});
