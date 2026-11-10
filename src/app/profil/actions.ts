"use server";

import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { lireUtilisateur } from "@/lib/acces";
import { auth } from "@/lib/auth";
import { dureeEnMinutes, erreurCode, normaliserCode } from "@/lib/connexion";
import { envoyerCourriel } from "@/lib/courriel";
import { consommerLimite } from "@/lib/garde-connexion";
import { noterEvenement } from "@/lib/garde-journal";
import { cleLimite, LIMITE_ENVOIS } from "@/lib/limite-connexion";
import { prisma } from "@/lib/prisma";
import { validerNom } from "@/lib/profil";
import { rattacherReservationsSansCompte } from "@/lib/rattachement";
import { fermerPaiementsEnCours } from "@/lib/suivi-paiement";
import {
  DUREE_CODE_SUPPRESSION_MS,
  effacerCompte,
  empreinteCodeSuppression,
  genererCodeSuppression,
  messageCodeSuppression,
  MESSAGES_REFUS,
  refusSuppression,
  verifierCodeSuppression,
} from "@/lib/suppression-compte";

// Actions de la page « Mon profil ». Chacune relit elle-même la session
// (lireUtilisateur) : appelée en POST forgé, sans page ni proxy, elle n'agit
// que sur le compte connecté, jamais sur un identifiant venu du navigateur
// sans vérifier qu'il lui appartient (tests : actions.test.ts).

const NON_CONNECTE = "Votre session a expiré. Reconnectez-vous.";

// --- Nom ---

export type EtatNom = { erreur?: string; succes?: string; valeur?: string };

export async function modifierNom(_etat: EtatNom, donnees: FormData): Promise<EtatNom> {
  const utilisateur = await lireUtilisateur();
  const saisie = String(donnees.get("nom") ?? "");
  if (!utilisateur) return { erreur: NON_CONNECTE, valeur: saisie };

  const resultat = validerNom(saisie);
  if (!resultat.ok) return { erreur: resultat.erreur, valeur: saisie };

  // Seul le nom : le rôle et l'e-mail ne se changent pas ici.
  await prisma.user.update({ where: { id: utilisateur.id }, data: { name: resultat.nom } });
  // L'initiale de l'en-tête suit.
  refresh();
  return { succes: "Votre nom est enregistré.", valeur: resultat.nom };
}

// --- Appareils connectés ---

export type EtatAppareils = { erreur?: string; succes?: string };

// Déconnecte UN autre appareil. `sessionId` vient du navigateur : la
// suppression ne touche qu'une session de CE compte, et jamais celle de la
// requête (pour elle, « Se déconnecter »). Une session d'un autre compte
// reçoit la même réponse qu'une session inexistante.
export async function deconnecterAppareil(sessionId: string): Promise<EtatAppareils> {
  const utilisateur = await lireUtilisateur();
  if (!utilisateur) return { erreur: NON_CONNECTE };
  if (typeof sessionId !== "string" || sessionId === utilisateur.sessionId) {
    return { erreur: "Cet appareil n'est plus connecté." };
  }

  const { count } = await prisma.session.deleteMany({
    where: { id: sessionId, userId: utilisateur.id },
  });
  if (count === 0) return { erreur: "Cet appareil n'est plus connecté." };
  await noterEvenement(
    { type: "APPAREIL_DECONNECTE", email: utilisateur.email, utilisateurId: utilisateur.id, motif: "un-appareil" },
    await headers(),
  );
  refresh();
  return { succes: "L'appareil est déconnecté." };
}

export async function deconnecterAutresAppareils(): Promise<EtatAppareils> {
  const utilisateur = await lireUtilisateur();
  if (!utilisateur) return { erreur: NON_CONNECTE };

  const { count } = await prisma.session.deleteMany({
    where: { userId: utilisateur.id, id: { not: utilisateur.sessionId } },
  });
  if (count > 0) {
    await noterEvenement(
      {
        type: "APPAREIL_DECONNECTE",
        email: utilisateur.email,
        utilisateurId: utilisateur.id,
        motif: "autres-appareils",
      },
      await headers(),
    );
  }
  refresh();
  return {
    succes:
      count === 0
        ? "Aucun autre appareil n'était connecté."
        : `${count} appareil${count > 1 ? "s" : ""} déconnecté${count > 1 ? "s" : ""}.`,
  };
}

// --- Suppression du compte ---

export type EtatSuppression = {
  etape: "debut" | "code";
  erreur?: string;
  envoyeA?: string;
  valeur?: string;
};

async function nombreAdministrateurs() {
  return prisma.user.count({ where: { role: "ADMIN" } });
}

// Étape 1 : un NOUVEAU code par e-mail, valable 5 minutes, dans cette session.
// Une nouvelle demande remplace le code précédent.
export async function demanderCodeSuppression(): Promise<EtatSuppression> {
  const utilisateur = await lireUtilisateur();
  if (!utilisateur) return { etape: "debut", erreur: NON_CONNECTE };

  const refus = refusSuppression(utilisateur, await nombreAdministrateurs());
  if (refus) return { etape: "debut", erreur: MESSAGES_REFUS[refus] };

  const limite = await consommerLimite(cleLimite("suppression", utilisateur.email), LIMITE_ENVOIS);
  if (!limite.autorise) {
    return {
      etape: "debut",
      erreur: `Trop de codes demandés. Réessayez dans ${dureeEnMinutes(limite.reessayerDansSecondes)}.`,
    };
  }

  const code = genererCodeSuppression();
  const ligne = {
    sessionId: utilisateur.sessionId,
    empreinte: empreinteCodeSuppression(utilisateur.id, code),
    essais: 0,
    expireLe: new Date(Date.now() + DUREE_CODE_SUPPRESSION_MS),
  };
  await prisma.codeSuppressionCompte.upsert({
    where: { utilisateurId: utilisateur.id },
    create: { utilisateurId: utilisateur.id, ...ligne },
    update: ligne,
  });

  try {
    await envoyerCourriel({
      a: utilisateur.email,
      sujet: `Suppression de votre compte Réunéa : code ${code}`,
      texte:
        `Pour confirmer la suppression de votre compte, saisissez le code ${code}.\n\n` +
        `Il est valable ${DUREE_CODE_SUPPRESSION_MS / 60_000} minutes, ne sert qu'une fois, ` +
        "et seulement sur l'appareil où vous l'avez demandé.\n" +
        "Si vous n'avez rien demandé, ignorez cet e-mail et déconnectez vos autres appareils " +
        "depuis la page Mon profil : votre compte reste intact.",
    });
  } catch (erreur) {
    console.error("Envoi du code de suppression impossible", erreur);
    return { etape: "debut", erreur: "L'e-mail n'a pas pu partir. Réessayez dans un instant." };
  }
  return { etape: "code", envoyeA: utilisateur.email };
}

// Étape 2 : le code saisi, puis l'effacement. Réussi : redirection vers
// /compte-supprime, session et cookie supprimés.
export async function confirmerSuppression(
  _etat: EtatSuppression,
  donnees: FormData,
): Promise<EtatSuppression> {
  const utilisateur = await lireUtilisateur();
  const saisie = String(donnees.get("code") ?? "");
  if (!utilisateur) return { etape: "debut", erreur: NON_CONNECTE };
  const etat = { etape: "code" as const, envoyeA: utilisateur.email, valeur: saisie };

  const refus = refusSuppression(utilisateur, await nombreAdministrateurs());
  if (refus) return { etape: "debut", erreur: MESSAGES_REFUS[refus] };

  const code = normaliserCode(saisie);
  const invalide = erreurCode(code);
  if (invalide) return { ...etat, erreur: invalide };

  const ligne = await prisma.codeSuppressionCompte.findUnique({
    where: { utilisateurId: utilisateur.id },
  });
  const verification = verifierCodeSuppression(
    ligne,
    { utilisateurId: utilisateur.id, sessionId: utilisateur.sessionId, code },
    new Date(),
  );
  if (!verification.ok && verification.raison !== "incorrect") {
    return { ...etat, erreur: messageCodeSuppression(verification.raison) };
  }
  // L'essai est compté AVANT de croire le code, et seulement si personne n'a
  // essayé entre-temps (essais inchangé) : des requêtes simultanées ne
  // donnent pas plus de 3 essais.
  const { count } = await prisma.codeSuppressionCompte.updateMany({
    where: { utilisateurId: utilisateur.id, essais: ligne!.essais },
    data: { essais: { increment: 1 } },
  });
  if (count === 0) return { ...etat, erreur: messageCodeSuppression("incorrect") };
  if (!verification.ok) return { ...etat, erreur: messageCodeSuppression(verification.raison) };
  // Un code ne sert qu'une fois.
  await prisma.codeSuppressionCompte.delete({ where: { utilisateurId: utilisateur.id } });

  // Aucune réservation ne doit rester payable après la suppression.
  if (!(await fermerPaiementsEnCours(utilisateur.id, new Date()))) {
    return {
      etape: "debut",
      erreur:
        "Un paiement est en cours sur l'une de vos réservations. Réessayez dans quelques minutes : " +
        "votre compte n'a pas été supprimé.",
    };
  }
  // Une réservation faite sans compte à cette adresse est la sienne aussi :
  // rattachée, elle est traitée avec les autres.
  await rattacherReservationsSansCompte(utilisateur.id);

  const resultat = await effacerCompte(prisma, utilisateur.id);
  if (!resultat.ok) {
    return {
      etape: "debut",
      erreur: resultat.raison === "dernier-admin" ? MESSAGES_REFUS["dernier-admin"] : NON_CONNECTE,
    };
  }

  // Trace gardée 90 jours, comme les autres (SECURITE.md, section 15).
  await noterEvenement(
    { type: "COMPTE_SUPPRIME", email: resultat.email, utilisateurId: utilisateur.id },
    await headers(),
  );

  // La session n'existe plus en base ; on retire aussi les cookies.
  const { authCookies } = await auth.$context;
  const pot = await cookies();
  for (const { name } of [authCookies.sessionToken, authCookies.sessionData, authCookies.dontRememberToken]) {
    pot.delete(name);
  }

  void envoyerCourriel({
    a: resultat.email,
    sujet: "Votre compte Réunéa est supprimé",
    texte:
      "Votre compte et vos données personnelles ont été supprimés.\n\n" +
      (resultat.anonymisees > 0
        ? `${resultat.anonymisees} réservation${resultat.anonymisees > 1 ? "s" : ""} payée${resultat.anonymisees > 1 ? "s" : ""} ` +
          "reste" + (resultat.anonymisees > 1 ? "nt" : "") +
          " dans notre comptabilité, sans votre nom ni votre adresse.\n"
        : "") +
      "Cet e-mail est le dernier que vous recevez de notre part.",
  }).catch((erreur) => console.error("Envoi de la confirmation de suppression impossible", erreur));

  redirect("/compte-supprime");
}
