import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { exigeDeuxiemeFacteur, lireRole, type EtatDeuxiemeFacteur, type Role } from "@/lib/roles";

// Suppression d'un compte par son titulaire (page « Mon profil », RGPD
// article 17, SECURITE.md section 14).
//
// - Confirmée par un NOUVEAU code à 6 chiffres envoyé par e-mail : la seule
//   session ouverte (ordinateur resté allumé, cookie volé) ne suffit pas.
// - Les données personnelles disparaissent : compte, sessions, second
//   facteur, codes en cours, compteurs de limite, tickets du support écrits
//   depuis cette adresse, réservations jamais payées.
// - Une réservation payée reste pour la comptabilité, ANONYMISÉE : ni nom, ni
//   e-mail, ni titulaire ; restent la salle, le créneau, le montant, le
//   statut et la référence du paiement Stripe.
// - Le dernier administrateur ne peut pas supprimer son compte : plus
//   personne ne pourrait administrer le centre.
//
// Ce module ne lit pas `@/lib/prisma` : effacerCompte reçoit le client, pour
// être testé sur une vraie base SQLite temporaire (suppression-compte.test.ts).

export const LONGUEUR_CODE_SUPPRESSION = 6;
export const DUREE_CODE_SUPPRESSION_MS = 5 * 60_000;
export const ESSAIS_CODE_SUPPRESSION = 3;

// Ce qui remplace le nom et l'e-mail d'une réservation conservée. E-mail
// vide : aucune adresse ne lui correspond, donc rattacherReservationsSansCompte
// ne la donnera jamais à un nouveau compte ouvert à la même adresse.
export const NOM_ANONYME = "Client supprimé";
export const EMAIL_ANONYME = "";

// --- Code de confirmation ---

export function genererCodeSuppression(): string {
  return String(randomInt(0, 10 ** LONGUEUR_CODE_SUPPRESSION)).padStart(
    LONGUEUR_CODE_SUPPRESSION,
    "0",
  );
}

// Empreinte liée au compte : la même valeur ne sert pas pour un autre.
export function empreinteCodeSuppression(utilisateurId: string, code: string): string {
  return createHash("sha256").update(`${utilisateurId}:${code}`).digest("hex");
}

export type CodeEnregistre = {
  utilisateurId: string;
  sessionId: string;
  empreinte: string;
  essais: number;
  expireLe: Date;
};

export type VerificationCode =
  | { ok: true }
  | { ok: false; raison: "absent" | "expire" | "trop-d-essais" | "incorrect" };

// Décision pure sur un code saisi. Un code demandé depuis une autre session
// (même compte, autre appareil) vaut « absent » : il faut le saisir là où on
// l'a demandé. L'appelant compte l'essai avant de croire « ok ».
export function verifierCodeSuppression(
  ligne: CodeEnregistre | null,
  demande: { utilisateurId: string; sessionId: string; code: string },
  maintenant: Date,
): VerificationCode {
  if (!ligne || ligne.utilisateurId !== demande.utilisateurId) {
    return { ok: false, raison: "absent" };
  }
  if (ligne.sessionId !== demande.sessionId) return { ok: false, raison: "absent" };
  if (ligne.expireLe.getTime() <= maintenant.getTime()) return { ok: false, raison: "expire" };
  if (ligne.essais >= ESSAIS_CODE_SUPPRESSION) return { ok: false, raison: "trop-d-essais" };
  const attendue = Buffer.from(ligne.empreinte, "hex");
  const saisie = Buffer.from(empreinteCodeSuppression(demande.utilisateurId, demande.code), "hex");
  const egales = attendue.length === saisie.length && timingSafeEqual(attendue, saisie);
  return egales ? { ok: true } : { ok: false, raison: "incorrect" };
}

export function messageCodeSuppression(raison: Exclude<VerificationCode, { ok: true }>["raison"]) {
  switch (raison) {
    case "absent":
      return "Aucun code en cours sur cet appareil. Demandez un nouveau code.";
    case "expire":
      return "Ce code a expiré (il est valable 5 minutes). Demandez-en un nouveau.";
    case "trop-d-essais":
      return "Trop d'essais avec ce code : il n'est plus valable. Demandez-en un nouveau.";
    case "incorrect":
      return "Code incorrect. Vérifiez les 6 chiffres du dernier e-mail reçu.";
  }
}

// --- Qui peut supprimer son compte ---

export type RefusSuppression = "dernier-admin" | "deuxieme-facteur";

// `roleCompte` : le rôle ENREGISTRÉ, pas le rôle effectif. Un administrateur
// qui n'a pas encore saisi son second facteur a les droits d'un client, mais
// il reste le dernier administrateur.
export function refusSuppression(
  compte: { roleCompte: Role; deuxiemeFacteur: EtatDeuxiemeFacteur },
  nombreAdministrateurs: number,
): RefusSuppression | null {
  if (compte.roleCompte === "ADMIN" && nombreAdministrateurs <= 1) return "dernier-admin";
  // Le personnel prouve son second facteur : la boîte e-mail seule ne
  // suffit pas pour lui (SECURITE.md, section 13).
  if (exigeDeuxiemeFacteur(compte.roleCompte) && compte.deuxiemeFacteur !== "valide") {
    return "deuxieme-facteur";
  }
  return null;
}

export const MESSAGES_REFUS: Record<RefusSuppression, string> = {
  "dernier-admin":
    "Vous êtes le dernier administrateur : votre compte ne peut pas être supprimé. " +
    "Nommez d'abord un autre administrateur.",
  "deuxieme-facteur":
    "Validez d'abord votre second facteur (application d'authentification) pour supprimer votre compte.",
};

// --- Réservations ---

export type SortReservation = "anonymiser" | "supprimer";

// Payée, ou passée par Stripe (une session de paiement a été ouverte : il a pu
// y avoir un encaissement, puis un remboursement) : la comptabilité la garde,
// anonymisée. Jamais envoyée au paiement : rien à justifier, supprimée.
// Une fois anonymisée, la ligne ne contient plus aucune donnée personnelle.
export function sortReservation(reservation: {
  statut: string;
  stripeSessionId: string | null;
}): SortReservation {
  return reservation.statut === "CONFIRMEE" || reservation.stripeSessionId !== null
    ? "anonymiser"
    : "supprimer";
}

const normaliser = (email: string) => email.trim().toLowerCase();

export type ResultatEffacement =
  | { ok: true; email: string; anonymisees: number; supprimees: number; tickets: number }
  | { ok: false; raison: "introuvable" | "dernier-admin" };

// Efface le compte et ses données, en une transaction : tout ou rien.
// À appeler APRÈS avoir fermé les paiements Stripe en cours
// (fermerPaiementsEnCours) : une réservation EN_ATTENTE envoyée à Stripe est
// alors annulée et gardée anonymisée, l'autre supprimée.
// La règle du dernier administrateur est revérifiée ici, dans la transaction :
// deux administrateurs qui suppriment leur compte en même temps ne peuvent pas
// tous les deux passer (SQLite n'a qu'un écrivain à la fois).
export async function effacerCompte(
  client: PrismaClient,
  utilisateurId: string,
): Promise<ResultatEffacement> {
  return client.$transaction(async (tx) => {
    const compte = await tx.user.findUnique({
      where: { id: utilisateurId },
      select: { email: true, role: true },
    });
    if (!compte) return { ok: false, raison: "introuvable" };

    if (lireRole(compte.role) === "ADMIN") {
      const administrateurs = await tx.user.count({ where: { role: "ADMIN" } });
      if (administrateurs <= 1) return { ok: false, raison: "dernier-admin" };
    }

    const reservations = await tx.reservation.findMany({
      where: { utilisateurId },
      select: { id: true, statut: true, stripeSessionId: true },
    });
    const aAnonymiser = reservations.filter((r) => sortReservation(r) === "anonymiser");
    const aSupprimer = reservations.filter((r) => sortReservation(r) === "supprimer");

    // Paiement fermé avant l'appel : une réservation encore en attente ne
    // sera jamais payée, elle est annulée.
    await tx.reservation.updateMany({
      where: { id: { in: aAnonymiser.map((r) => r.id) }, statut: "EN_ATTENTE" },
      data: { statut: "ANNULEE" },
    });
    await tx.reservation.updateMany({
      where: { id: { in: aAnonymiser.map((r) => r.id) } },
      data: { nomClient: NOM_ANONYME, emailClient: EMAIL_ANONYME, utilisateurId: null },
    });
    await tx.reservation.deleteMany({ where: { id: { in: aSupprimer.map((r) => r.id) } } });

    // Tickets du support écrits depuis cette adresse (message libre, e-mail) :
    // casse et espaces ignorés, comme au rattachement.
    const email = normaliser(compte.email);
    const tickets = await tx.ticket.findMany({ select: { id: true, email: true } });
    const ticketsDuCompte = tickets.filter((t) => normaliser(t.email) === email).map((t) => t.id);
    await tx.ticket.deleteMany({ where: { id: { in: ticketsDuCompte } } });

    // Codes de connexion en cours (« sign-in-otp-<e-mail> ») et compteurs de
    // limite (« envoi:<e-mail> »...) : ils contiennent l'adresse.
    await tx.verification.deleteMany({ where: { identifier: { endsWith: `-${email}` } } });
    await tx.limiteConnexion.deleteMany({ where: { cle: { endsWith: `:${email}` } } });
    await tx.codeSuppressionCompte.deleteMany({ where: { utilisateurId } });

    // Sessions (tous les appareils), comptes de connexion et second facteur
    // partent avec le compte (onDelete: Cascade).
    await tx.user.delete({ where: { id: utilisateurId } });

    return {
      ok: true,
      email: compte.email,
      anonymisees: aAnonymiser.length,
      supprimees: aSupprimer.length,
      tickets: ticketsDuCompte.length,
    };
  });
}
