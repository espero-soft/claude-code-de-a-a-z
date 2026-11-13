import type { PrismaClient } from "@/generated/prisma/client";

// Remise à zéro nocturne du site de démonstration public
// (scripts/remettre-a-zero-demo.ts, lancé chaque nuit par
// deploiement/reunea-remise-a-zero.timer).
//
// Efface ce que les visiteurs ont créé :
// - TOUTES les réservations (en attente, confirmées, annulées) : le planning
//   repart vide chaque matin ;
// - les comptes CLIENT, avec ce qui contient leur adresse : sessions, comptes
//   de connexion, second facteur (cascade), codes en cours, compteurs de
//   limite, code de suppression, tickets du support écrits depuis l'adresse.
//
// Ne touche JAMAIS : les salles et leurs équipements, les comptes du
// personnel (EMPLOYE, ADMIN) et leurs sessions, le journal des connexions
// (trace de sécurité, effacée au bout de 90 jours comme annoncé sur
// /demonstration).
//
// Reçoit le client, pour être testé sur une vraie base SQLite temporaire
// (remise-a-zero-demo.test.ts).

// Liste fermée : seul un compte explicitement client (ou sans rôle, que
// l'application traite en client) est effacé. Un rôle inattendu reste.
export function estCompteDeDemonstration(role: string | null): boolean {
  return role === null || role === "CLIENT";
}

export type BilanRemiseAZero = {
  reservations: number;
  comptes: number;
  tickets: number;
};

const normaliser = (email: string) => email.trim().toLowerCase();

// Une seule transaction : tout ou rien.
export async function remettreAZeroDemo(client: PrismaClient): Promise<BilanRemiseAZero> {
  return client.$transaction(async (tx) => {
    const reservations = await tx.reservation.deleteMany({});

    const comptes = (await tx.user.findMany({ select: { id: true, email: true, role: true } }))
      .filter((compte) => estCompteDeDemonstration(compte.role));
    const ids = comptes.map((compte) => compte.id);
    const emails = new Set(comptes.map((compte) => normaliser(compte.email)));

    const tickets = (await tx.ticket.findMany({ select: { id: true, email: true } }))
      .filter((ticket) => emails.has(normaliser(ticket.email)))
      .map((ticket) => ticket.id);
    await tx.ticket.deleteMany({ where: { id: { in: tickets } } });

    // Codes de connexion en cours (« sign-in-otp-<e-mail> ») et compteurs
    // (« envoi:<e-mail> »...) : comparaison exacte de la fin, comme effacerCompte.
    const verifications = await tx.verification.findMany({ select: { id: true, identifier: true } });
    await tx.verification.deleteMany({
      where: {
        id: {
          in: verifications
            .filter((v) => [...emails].some((email) => v.identifier.endsWith(`-${email}`)))
            .map((v) => v.id),
        },
      },
    });
    const limites = await tx.limiteConnexion.findMany({ select: { cle: true } });
    await tx.limiteConnexion.deleteMany({
      where: {
        cle: {
          in: limites
            .filter((l) => [...emails].some((email) => l.cle.endsWith(`:${email}`)))
            .map((l) => l.cle),
        },
      },
    });
    await tx.codeSuppressionCompte.deleteMany({ where: { utilisateurId: { in: ids } } });

    // Sessions, comptes de connexion et second facteur : onDelete: Cascade.
    await tx.user.deleteMany({ where: { id: { in: ids } } });

    return { reservations: reservations.count, comptes: ids.length, tickets: tickets.length };
  });
}
