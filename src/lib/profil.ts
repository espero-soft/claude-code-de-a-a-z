// Logique pure de la page « Mon profil » (/profil) : nom du compte et
// appareils connectés (sessions). Testée dans profil.test.ts, sans base.

export const LONGUEUR_MAX_NOM = 80;

export type ResultatNom = { ok: true; nom: string } | { ok: false; erreur: string };

// Nom affiché sur les réservations et dans l'en-tête. Espaces superflus
// retirés ; ni vide, ni trop long, ni caractère de contrôle (retour à la
// ligne collé, caractère invisible qui fausserait l'affichage).
export function validerNom(saisie: string): ResultatNom {
  const nom = saisie.replace(/\s+/g, " ").trim();
  if (nom === "") return { ok: false, erreur: "Indiquez votre nom." };
  if (Array.from(nom).length > LONGUEUR_MAX_NOM) {
    return { ok: false, erreur: `Votre nom ne doit pas dépasser ${LONGUEUR_MAX_NOM} caractères.` };
  }
  // Contrôle (C0, C1), largeur nulle, sens d'écriture forcé, séparateurs de
  // ligne et de paragraphe, BOM (ceux que \s n'a pas déjà remplacés).
  if (/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/.test(nom)) {
    return { ok: false, erreur: "Votre nom contient un caractère non autorisé." };
  }
  return { ok: true, nom };
}

// --- Appareils connectés ---

// Navigateur et système d'après l'en-tête User-Agent enregistré avec la
// session : « Chrome sur macOS ». Indicatif seulement (le navigateur choisit
// cet en-tête) : il aide à reconnaître un appareil, il ne prouve rien.
// L'ordre compte : Edge et Opera se déclarent aussi « Chrome », Chrome se
// déclare aussi « Safari », Android se déclare aussi « Linux ».
const NAVIGATEURS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\/|Chromium\//, "Chrome"],
  [/Version\/[\d.]+.*Safari\//, "Safari"],
];

const SYSTEMES: [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Linux/, "Linux"],
];

export function decrireAppareil(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const navigateur = NAVIGATEURS.find(([motif]) => motif.test(ua))?.[1];
  const systeme = SYSTEMES.find(([motif]) => motif.test(ua))?.[1];
  if (navigateur && systeme) return `${navigateur} sur ${systeme}`;
  if (navigateur) return navigateur;
  if (systeme) return `Navigateur sur ${systeme}`;
  return "Appareil inconnu";
}

export type SessionCompte = {
  id: string;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
};

export type Appareil = {
  id: string; // identifiant de la session, jamais son jeton
  libelle: string;
  connecteLe: Date;
  actifLe: Date;
  courant: boolean; // celui depuis lequel on consulte la page
};

// Sessions encore valables du compte, celle-ci en premier, puis de la plus
// récemment utilisée à la plus ancienne. Une session expirée ne permet plus
// rien : elle n'est pas un appareil connecté.
export function listerAppareils(
  sessions: readonly SessionCompte[],
  idCourant: string,
  maintenant: Date,
): Appareil[] {
  return sessions
    .filter((s) => s.expiresAt.getTime() > maintenant.getTime())
    .map((s) => ({
      id: s.id,
      libelle: decrireAppareil(s.userAgent),
      connecteLe: s.createdAt,
      actifLe: s.updatedAt,
      courant: s.id === idCourant,
    }))
    .sort((a, b) =>
      a.courant !== b.courant ? (a.courant ? -1 : 1) : b.actifLe.getTime() - a.actifLe.getTime(),
    );
}
