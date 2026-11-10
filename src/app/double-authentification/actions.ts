"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { renderSVG } from "uqr";
import { lireUtilisateur } from "@/lib/acces";
import { auth } from "@/lib/auth";
import { cheminDeRetour } from "@/lib/connexion";
import {
  erreurCodeSecours,
  erreurCodeTotp,
  messageDeuxiemeFacteur,
  normaliserCodeSecours,
  normaliserCodeTotp,
  secretDepuisUri,
} from "@/lib/deuxieme-facteur";

// Second facteur du personnel (SECURITE.md, section 13). Chaque action relit
// la session et l'état du second facteur avant d'appeler Better Auth ; la
// garde gardeDeuxiemeFacteur revérifie de son côté (rôle, essais, rejeu).
// Appels par auth.api : la limite du personnel est posée par cette garde,
// valable en HTTP comme ici.

export type EtatEnrolement = {
  erreur?: string;
  // Montrés une seule fois : ni relus ni réaffichés ensuite (la route qui
  // relisait le secret est fermée). Recharger la page recommence
  // l'enrôlement avec un nouveau secret, l'ancien ne sert plus.
  secret?: string;
  qrSvg?: string;
  codesSecours?: string[];
};

function messageErreur(erreur: unknown): string {
  if (isAPIError(erreur)) {
    const corps = erreur.body as { code?: string; reessayerDansSecondes?: number } | undefined;
    return messageDeuxiemeFacteur({
      status: erreur.statusCode,
      code: corps?.code,
      reessayerDansSecondes: corps?.reessayerDansSecondes,
    });
  }
  console.error("Second facteur : erreur inattendue", erreur);
  return messageDeuxiemeFacteur(null);
}

// Étape 1 de l'enrôlement : secret, QR code et codes de secours.
export async function commencerEnrolement(): Promise<EtatEnrolement> {
  const utilisateur = await lireUtilisateur();
  if (!utilisateur || utilisateur.deuxiemeFacteur !== "a-enroler") {
    return { erreur: "Aucune configuration à faire pour ce compte." };
  }

  try {
    const resultat = await auth.api.enableTwoFactor({
      headers: await headers(),
      body: { method: "totp" },
    });
    if (resultat.method !== "totp" || !resultat.totpURI || !resultat.backupCodes) {
      return { erreur: messageDeuxiemeFacteur(null) };
    }
    const secret = secretDepuisUri(resultat.totpURI);
    if (!secret) return { erreur: messageDeuxiemeFacteur(null) };
    return {
      secret,
      // SVG produit ici, à partir de notre propre URI : rien ne vient du navigateur.
      qrSvg: renderSVG(resultat.totpURI, { pixelSize: 6, border: 2, blackColor: "#1B3A5C" }),
      codesSecours: resultat.backupCodes,
    };
  } catch (erreur) {
    return { erreur: messageErreur(erreur) };
  }
}

export type EtatCode = { erreur?: string; valeur?: string };

// Code de l'application (confirme l'enrôlement, ou valide la session), ou
// code de secours. Réussi : la session est marquée par gardeDeuxiemeFacteur,
// et l'on repart vers la page demandée.
export async function validerCode(
  retour: string,
  mode: "totp" | "secours",
  _etat: EtatCode,
  donnees: FormData,
): Promise<EtatCode> {
  const utilisateur = await lireUtilisateur();
  if (!utilisateur || utilisateur.deuxiemeFacteur === "inutile") {
    return { erreur: messageDeuxiemeFacteur({ code: "DEUXIEME_FACTEUR_RESERVE_AU_PERSONNEL" }) };
  }
  const destination = cheminDeRetour(retour);
  if (utilisateur.deuxiemeFacteur === "valide") redirect(destination);

  const saisie = String(donnees.get("code") ?? "");
  // Pas de code de secours avant la fin de l'enrôlement.
  if (mode === "secours" && utilisateur.deuxiemeFacteur === "a-enroler") {
    return { erreur: "Configurez d'abord l'application d'authentification.", valeur: saisie };
  }
  const code = mode === "totp" ? normaliserCodeTotp(saisie) : normaliserCodeSecours(saisie);
  const invalide = mode === "totp" ? erreurCodeTotp(code) : erreurCodeSecours(code);
  if (invalide) return { erreur: invalide, valeur: saisie };

  try {
    const requete = { headers: await headers(), body: { code } };
    if (mode === "totp") await auth.api.verifyTOTP(requete);
    else await auth.api.verifyBackupCode(requete);
  } catch (erreur) {
    return { erreur: messageErreur(erreur), valeur: saisie };
  }
  // redirect lève une exception : hors du try.
  redirect(destination);
}
