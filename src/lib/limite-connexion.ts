// Limite par adresse e-mail de la connexion par code (SECURITE.md, section 10).
// Logique pure : décide si une demande passe, d'après le compteur de l'adresse.
// Le stockage (table LimiteConnexion) et le branchement sur Better Auth sont
// dans src/lib/garde-connexion.ts.
//
// Pourquoi par adresse et pas seulement par IP : la limite de Better Auth
// compte par adresse IP, lue dans l'en-tête X-Forwarded-For, que le client
// peut choisir librement. En changeant d'en-tête à chaque requête, un pirate
// faisait envoyer autant de codes qu'il voulait à une victime, et essayait
// autant de codes qu'il voulait sur son compte (3 essais par code, mais un
// nouveau code à chaque fois). Compter par adresse e-mail ferme les deux.

export type RegleLimite = {
  max: number; // demandes autorisées dans la fenêtre
  fenetreMs: number; // durée de la fenêtre, en millisecondes
};

// Envois de codes vers une même adresse : de quoi demander un code et le
// renvoyer deux fois.
export const LIMITE_ENVOIS: RegleLimite = { max: 3, fenetreMs: 15 * 60_000 };

// Essais de code sur une même adresse, tous codes confondus. Avec 3 essais par
// code, c'est ce plafond qui borne la force brute : 10 essais par heure sur
// 10⁶ codes possibles, soit moins de 1 chance sur 4 000 par jour d'attaque.
export const LIMITE_ESSAIS: RegleLimite = { max: 10, fenetreMs: 60 * 60_000 };

// Essais de second facteur (code TOTP ou de secours) sur un même compte du
// personnel. Better Auth ne compte pas ces essais quand une session est déjà
// ouverte (notre cas : la session vient du code e-mail). 3 codes TOTP sont
// acceptés à un instant donné (fenêtre de ±30 s) : 5 essais par heure donnent
// moins de 1 chance sur 2 700 par jour, et il faut déjà la boîte e-mail.
export const LIMITE_DEUXIEME_FACTEUR: RegleLimite = { max: 5, fenetreMs: 60 * 60_000 };

// « suppression » : envois du code qui confirme la suppression d'un compte
// (même règle que LIMITE_ENVOIS).
export type TypeLimite = "envoi" | "essai" | "deuxieme-facteur" | "suppression";

export type Compteur = { nombre: number; debut: Date };

export type DecisionLimite =
  | { autorise: true; suivant: Compteur }
  | { autorise: false; reessayerDansSecondes: number };

// Clé du compteur. Better Auth met l'adresse en minuscules avant de chercher
// le code : on fait pareil, sinon « Victime@… » aurait son propre compteur.
export function cleLimite(type: TypeLimite, email: string): string {
  return `${type}:${email.trim().toLowerCase()}`;
}

// Fenêtre fixe : elle s'ouvre à la première demande et se referme au bout de
// fenetreMs ; la demande suivante en ouvre une nouvelle.
export function deciderLimite(
  compteur: Compteur | null,
  regle: RegleLimite,
  maintenant: Date,
): DecisionLimite {
  const finFenetre = compteur ? compteur.debut.getTime() + regle.fenetreMs : 0;
  if (!compteur || maintenant.getTime() >= finFenetre) {
    return { autorise: true, suivant: { nombre: 1, debut: maintenant } };
  }
  if (compteur.nombre >= regle.max) {
    return {
      autorise: false,
      reessayerDansSecondes: Math.ceil((finFenetre - maintenant.getTime()) / 1000),
    };
  }
  return { autorise: true, suivant: { nombre: compteur.nombre + 1, debut: compteur.debut } };
}
