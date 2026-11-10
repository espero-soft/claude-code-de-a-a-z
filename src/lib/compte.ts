import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { initialeCompte } from "@/lib/connexion";

export type CompteConnecte = { email: string; initiale: string };

// Compte de la requête en cours, ou null pour un visiteur. Lit le cookie de
// session : à appeler dans un composant sous <Suspense> (Cache Components),
// jamais dans un "use cache". cache() évite de relire la session quand
// l'en-tête et la page en ont besoin dans la même requête.
// Ne renvoie que ce que l'interface affiche (pas le jeton de session).
export const lireCompte = cache(async (): Promise<CompteConnecte | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { email, name } = session.user;
  return { email, initiale: initialeCompte(name, email) };
});
