// Logique pure de l'écran /connexion (sans mot de passe, voir SECURITE.md,
// section 7) : vérification des saisies avant l'appel à Better Auth,
// traduction de ses erreurs en français, chemin de retour après connexion,
// initiale affichée dans l'en-tête.

export const LONGUEUR_CODE = 6;

const MOTIF_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Message d'erreur du champ e-mail, ou null si la saisie peut être envoyée.
// Better Auth revérifie l'adresse : ceci évite seulement un aller-retour.
export function erreurEmail(email: string): string | null {
  const valeur = email.trim();
  if (valeur === "") return "Saisissez votre adresse e-mail.";
  if (!MOTIF_EMAIL.test(valeur)) {
    return "Adresse e-mail invalide. Exemple : nom@exemple.fr";
  }
  return null;
}

// Le code peut être collé avec des espaces (« 123 456 ») : on les retire.
export function normaliserCode(code: string): string {
  return code.replace(/\s+/g, "");
}

export function erreurCode(code: string): string | null {
  const valeur = normaliserCode(code);
  if (valeur === "") return `Saisissez le code à ${LONGUEUR_CODE} chiffres reçu par e-mail.`;
  if (!new RegExp(`^\\d{${LONGUEUR_CODE}}$`).test(valeur)) {
    return `Le code contient exactement ${LONGUEUR_CODE} chiffres.`;
  }
  return null;
}

// Erreur renvoyée par le client Better Auth ({ status, code }), ou null pour
// une erreur réseau (serveur injoignable).
export type ErreurAuth = { status?: number; code?: string } | null;

export type MessageErreur = {
  // Champ concerné : le message s'affiche sous le champ, sinon dans un encadré.
  champ: "email" | "code" | "general";
  message: string;
  // Le code n'est plus utilisable : il faut en demander un autre.
  nouveauCodeNecessaire?: boolean;
};

export function messageErreurConnexion(erreur: ErreurAuth): MessageErreur {
  if (erreur?.status === 429) {
    return {
      champ: "general",
      message: "Trop de demandes en peu de temps. Patientez une minute, puis réessayez.",
    };
  }
  switch (erreur?.code) {
    case "INVALID_EMAIL":
      return { champ: "email", message: "Adresse e-mail invalide. Exemple : nom@exemple.fr" };
    case "INVALID_OTP":
      return {
        champ: "code",
        message: "Code incorrect. Vérifiez les 6 chiffres du dernier e-mail reçu.",
      };
    case "OTP_EXPIRED":
      return {
        champ: "code",
        message: "Ce code a expiré (il est valable 5 minutes). Demandez-en un nouveau.",
        nouveauCodeNecessaire: true,
      };
    case "TOO_MANY_ATTEMPTS":
      return {
        champ: "code",
        message: "Trop d'essais avec ce code : il n'est plus valable. Demandez-en un nouveau.",
        nouveauCodeNecessaire: true,
      };
    default:
      return {
        champ: "general",
        message: "La connexion n'a pas abouti. Vérifiez votre connexion internet et réessayez.",
      };
  }
}

// Après la connexion, on revient à la page demandée (?retour=/salles/...),
// seulement si c'est un chemin de ce site : « //autre.site » ou
// « https://... » ouvriraient une redirection vers l'extérieur.
export function cheminDeRetour(valeur: string | string[] | undefined): string {
  if (typeof valeur !== "string") return "/";
  if (!valeur.startsWith("/") || valeur.startsWith("//") || valeur.includes("\\")) return "/";
  // Revenir sur /connexion n'aurait pas de sens.
  if (valeur === "/connexion" || valeur.startsWith("/connexion?")) return "/";
  return valeur;
}

// Initiale du compte pour l'en-tête : celle du nom s'il est renseigné, sinon
// celle de l'e-mail (le nom est vide à la création par code).
export function initialeCompte(nom: string, email: string): string {
  const source = nom.trim() || email.trim();
  const premiere = Array.from(source)[0] ?? "?";
  return premiere.toLocaleUpperCase("fr-FR");
}
