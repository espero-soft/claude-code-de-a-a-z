// Logique pure de l'écran /double-authentification (second facteur du
// personnel, SECURITE.md section 13) : saisies, secret affiché, messages en
// français. Testée dans deuxieme-facteur.test.ts.

import { dureeEnMinutes, type ErreurAuth } from "@/lib/connexion";

// Code de l'application : 6 chiffres. On tolère les espaces que certaines
// applications affichent au milieu (« 123 456 »).
export function normaliserCodeTotp(saisie: string): string {
  return saisie.replace(/\s+/g, "");
}

export function erreurCodeTotp(code: string): string | null {
  if (!code) return "Saisissez le code à 6 chiffres affiché par l'application.";
  if (!/^\d{6}$/.test(code)) return "Le code compte exactement 6 chiffres.";
  return null;
}

// Code de secours : « AbCd1-23xYz » (10 caractères, tiret au milieu, casse
// respectée). Sans le tiret, on le remet ; les espaces autour sont ignorés.
export function normaliserCodeSecours(saisie: string): string {
  const brut = saisie.replace(/\s+/g, "");
  return /^[A-Za-z0-9]{10}$/.test(brut) ? `${brut.slice(0, 5)}-${brut.slice(5)}` : brut;
}

export function erreurCodeSecours(code: string): string | null {
  if (!code) return "Saisissez l'un de vos codes de secours.";
  if (!/^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/.test(code)) {
    return "Un code de secours a la forme AbCd1-23xYz (10 caractères).";
  }
  return null;
}

// Secret à saisir à la main dans l'application (si le QR code ne peut pas
// être lu) : celui de l'URI otpauth://, en base 32, par groupes de 4.
export function secretDepuisUri(uri: string): string | null {
  try {
    const url = new URL(uri);
    if (url.protocol !== "otpauth:") return null;
    return url.searchParams.get("secret");
  } catch {
    return null;
  }
}

export function grouperSecret(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(" ") ?? "";
}

// Erreurs de Better Auth (module twoFactor) et de gardeDeuxiemeFacteur, en
// français. Aucun détail technique : on dit quoi faire.
export function messageDeuxiemeFacteur(erreur: ErreurAuth): string {
  switch (erreur?.code) {
    case "INVALID_CODE":
      return "Code incorrect. Saisissez les 6 chiffres affichés en ce moment par l'application.";
    case "INVALID_BACKUP_CODE":
      return "Code de secours incorrect, ou déjà utilisé : chacun ne sert qu'une fois.";
    case "CODE_DEJA_UTILISE":
      return "Ce code vient déjà de servir. Attendez le suivant (30 secondes au plus).";
    case "TROP_D_ESSAIS_DE_DEUXIEME_FACTEUR":
      return (
        "Trop d'essais pour ce compte. Par sécurité, réessayez dans " +
        `${dureeEnMinutes(erreur.reessayerDansSecondes)}.`
      );
    case "TOTP_NOT_ENABLED":
    case "BACKUP_CODES_NOT_ENABLED":
      return "L'application d'authentification n'est pas encore configurée : rechargez la page.";
    case "TOTP_ALREADY_ENABLED":
      return "L'application est déjà configurée pour ce compte : saisissez son code.";
    case "DEUXIEME_FACTEUR_RESERVE_AU_PERSONNEL":
      return "Le second facteur est réservé aux employés et aux administrateurs.";
  }
  if (erreur?.status === 429) {
    return "Trop de demandes en peu de temps. Patientez une minute, puis réessayez.";
  }
  if (erreur?.status === 401) return "Votre session a expiré. Reconnectez-vous.";
  return "La vérification n'a pas abouti. Réessayez dans quelques instants.";
}
