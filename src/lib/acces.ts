import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  etatDeuxiemeFacteur,
  lireRole,
  peut,
  roleEffectif,
  type Capacite,
  type EtatDeuxiemeFacteur,
  type Role,
} from "@/lib/roles";

// Couche d'accès (SECURITE.md, section 4) : qui fait la requête, et avec quel
// rôle. Les pages ET chaque Server Action passent par ici : le proxy
// (src/proxy.ts) ne regarde que la présence d'un cookie, ce n'est pas une
// barrière. Les règles elles-mêmes sont pures, dans src/lib/roles.ts.
//
// Lit le cookie de session : à appeler dans un composant sous <Suspense>
// (Cache Components) ou dans une Server Action, jamais dans un "use cache".

export type Utilisateur = {
  id: string;
  email: string;
  nom: string;
  // Rôle qui ouvre les droits : celui du compte, ramené à CLIENT tant que le
  // second facteur d'un employé ou d'un administrateur n'est pas validé dans
  // cette session (roleEffectif). C'est lui que tous les contrôles lisent.
  role: Role;
  // Rôle enregistré sur le compte : pour guider vers le second facteur et
  // afficher le lien « Tickets », jamais pour ouvrir un droit.
  roleCompte: Role;
  deuxiemeFacteur: EtatDeuxiemeFacteur;
  // Identifiant (pas le jeton) de la session de cette requête : « cet
  // appareil » sur la page Mon profil.
  sessionId: string;
};

// cache() : une seule lecture par requête, même si l'en-tête et la page la
// demandent.
export const lireUtilisateur = cache(async (): Promise<Utilisateur | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  // Rôle, enrôlement et validation du second facteur relus en base, et non
  // dans la session : un rôle retiré prend effet à la requête suivante, même
  // si un cache de session est activé un jour (session.cookieCache).
  const [compte, ligneSession] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        twofactors: { where: { verified: true }, select: { id: true }, take: 1 },
      },
    }),
    prisma.session.findUnique({
      where: { id: session.session.id },
      select: { deuxiemeFacteurLe: true },
    }),
  ]);
  if (!compte || !ligneSession) return null;
  const roleCompte = lireRole(compte.role);
  const deuxiemeFacteur = etatDeuxiemeFacteur(
    roleCompte,
    { enrole: compte.twofactors.length > 0, valideLe: ligneSession.deuxiemeFacteurLe },
    new Date(),
  );
  return {
    id: compte.id,
    email: compte.email,
    nom: compte.name,
    role: roleEffectif(roleCompte, deuxiemeFacteur),
    roleCompte,
    deuxiemeFacteur,
    sessionId: session.session.id,
  };
});

// Le personnel qui n'a pas encore validé son second facteur dans cette
// session (à guider vers /double-authentification plutôt qu'un 404).
export function doitValiderDeuxiemeFacteur(utilisateur: Utilisateur): boolean {
  return utilisateur.deuxiemeFacteur === "a-enroler" || utilisateur.deuxiemeFacteur === "a-verifier";
}

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
