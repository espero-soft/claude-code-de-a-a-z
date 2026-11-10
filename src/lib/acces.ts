import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lireRole, peut, type Capacite, type Role } from "@/lib/roles";

// Couche d'accès (SECURITE.md, section 4) : qui fait la requête, et avec quel
// rôle. Les pages ET chaque Server Action passent par ici : le proxy
// (src/proxy.ts) ne regarde que la présence d'un cookie, ce n'est pas une
// barrière. Les règles elles-mêmes sont pures, dans src/lib/roles.ts.
//
// Lit le cookie de session : à appeler dans un composant sous <Suspense>
// (Cache Components) ou dans une Server Action, jamais dans un "use cache".

export type Utilisateur = { id: string; email: string; nom: string; role: Role };

// cache() : une seule lecture par requête, même si l'en-tête et la page la
// demandent.
export const lireUtilisateur = cache(async (): Promise<Utilisateur | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  // Le rôle est relu en base, et non dans la session : un rôle retiré prend
  // effet à la requête suivante, même si un cache de session est activé un
  // jour (session.cookieCache).
  const compte = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!compte) return null;
  return { id: compte.id, email: compte.email, nom: compte.name, role: lireRole(compte.role) };
});

// L'utilisateur s'il a la capacité demandée, sinon null (visiteur ou rôle
// insuffisant : l'appelant choisit sa réponse).
export async function utilisateurAvec(capacite: Capacite): Promise<Utilisateur | null> {
  const utilisateur = await lireUtilisateur();
  return utilisateur && peut(utilisateur.role, capacite) ? utilisateur : null;
}

// Ce qu'il faut savoir d'une réservation pour décider qui y accède
// (peutVoirReservation, peutPayerReservation), sans rien lire de personnel ni
// rien écrire : le contrôle se fait AVANT actualiserReservation, qui écrit.
export function lireTitulaireReservation(id: string) {
  return prisma.reservation.findUnique({ where: { id }, select: { utilisateurId: true } });
}
