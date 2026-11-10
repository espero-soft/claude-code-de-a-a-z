// Rattachement des réservations faites sans compte (avant le module 12) au
// compte qui a la même adresse e-mail (SECURITE.md, section 4, règle 6).
//
// Seulement si l'adresse du compte est VÉRIFIÉE : sinon, n'importe qui
// créerait un compte à l'adresse d'un autre pour lire ses réservations (nom,
// salle, créneau, montant). Avec la connexion par code, l'adresse est
// vérifiée au premier code ; un compte créé par `npm run admin:creer` ne
// l'est pas tant qu'il ne s'est pas connecté.
//
// Seules les réservations SANS titulaire sont concernées : on ne reprend
// jamais la réservation d'un autre compte. Les e-mails saisis à l'époque
// l'étaient librement : comparaison sans tenir compte de la casse ni des
// espaces autour.

import { prisma } from "@/lib/prisma";

type Compte = { id: string; email: string; emailVerified: boolean };
type Candidate = { id: string; emailClient: string; utilisateurId: string | null };

const normaliser = (email: string) => email.trim().toLowerCase();

// Décision pure (testée) : identifiants des réservations à rattacher.
export function reservationsARattacher(compte: Compte, candidates: readonly Candidate[]): string[] {
  if (!compte.emailVerified) return [];
  const adresse = normaliser(compte.email);
  if (!adresse) return [];
  return candidates
    .filter((r) => r.utilisateurId === null && normaliser(r.emailClient) === adresse)
    .map((r) => r.id);
}

// Applique la décision pour un compte ; renvoie le nombre de réservations
// rattachées. Appelée à chaque connexion (src/lib/auth.ts) et à l'ouverture
// de l'espace client. Les réservations sans titulaire ne font que diminuer :
// depuis le module 12, réserver exige un compte.
export async function rattacherReservationsSansCompte(utilisateurId: string): Promise<number> {
  const compte = await prisma.user.findUnique({
    where: { id: utilisateurId },
    select: { id: true, email: true, emailVerified: true },
  });
  if (!compte?.emailVerified) return 0;

  const candidates = await prisma.reservation.findMany({
    where: { utilisateurId: null },
    select: { id: true, emailClient: true, utilisateurId: true },
  });
  const ids = reservationsARattacher(compte, candidates);
  if (ids.length === 0) return 0;

  // `utilisateurId: null` revérifié à l'écriture : une réservation rattachée
  // entre-temps à un autre compte ne change pas de titulaire.
  const { count } = await prisma.reservation.updateMany({
    where: { id: { in: ids }, utilisateurId: null },
    data: { utilisateurId: compte.id },
  });
  return count;
}
