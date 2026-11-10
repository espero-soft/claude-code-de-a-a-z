// Journal des connexions (SECURITE.md, section 15) : logique pure, testée
// dans journal.test.ts sans base. L'écriture et la purge sont dans
// src/lib/journal-connexions.ts, la page dans src/app/admin/journal.
//
// Il répond à « qui s'est connecté, quand, et qu'est-ce qui a échoué ? ».
// Règle d'or : JAMAIS un code, un jeton ni un secret. Le journal n'a donc
// aucun champ de texte libre : le type et le motif viennent de listes fermées,
// l'adresse IP doit en avoir la forme, le navigateur est l'en-tête User-Agent
// tronqué. Un objet plus riche (corps de requête, session entière) passé par
// erreur est réduit à ces champs.

export const TYPES_EVENEMENT = [
  "CODE_DEMANDE",
  "CONNEXION_REUSSIE",
  "CODE_REFUSE",
  "COMPTE_BLOQUE",
  "DEUXIEME_FACTEUR_VALIDE",
  "DEUXIEME_FACTEUR_REFUSE",
  "DECONNEXION",
  "APPAREIL_DECONNECTE",
  "COMPTE_SUPPRIME",
] as const;
export type TypeEvenement = (typeof TYPES_EVENEMENT)[number];

export const MOTIFS = [
  // Code de connexion refusé
  "code-incorrect",
  "code-expire",
  "code-epuise", // 3 essais faits sur ce code : il faut en demander un autre
  // Compte bloqué (limites de SECURITE.md, sections 10 et 13)
  "trop-de-codes-demandes",
  "trop-d-essais-de-code",
  "trop-d-essais-de-deuxieme-facteur",
  // Second facteur
  "application", // code de l'application d'authentification
  "code-de-secours",
  "code-deja-utilise",
  // Déconnexion depuis Mon profil
  "un-appareil",
  "autres-appareils",
  "autre",
] as const;
export type Motif = (typeof MOTIFS)[number];

// Ce que l'on accepte d'enregistrer, et rien d'autre.
export type Evenement = {
  type: TypeEvenement;
  email?: string | null;
  utilisateurId?: string | null;
  motif?: Motif | null;
  ip?: string | null;
  navigateur?: string | null;
};

export type LigneJournal = {
  type: TypeEvenement;
  email: string;
  utilisateurId: string | null;
  motif: Motif | null;
  ip: string | null;
  navigateur: string | null;
  createdAt: Date;
};

// Conservation : 90 jours au plus, puis effacement automatique.
export const DUREE_CONSERVATION_JOURS = 90;
export const DUREE_CONSERVATION_MS = DUREE_CONSERVATION_JOURS * 24 * 60 * 60 * 1000;

// Les lignes créées avant cette date sont à effacer.
export function limiteConservation(maintenant: Date): Date {
  return new Date(maintenant.getTime() - DUREE_CONSERVATION_MS);
}

export const LONGUEUR_MAX_NAVIGATEUR = 300;
const LONGUEUR_MAX_EMAIL = 254; // RFC 5321
const LONGUEUR_MAX_IP = 45; // IPv6 avec IPv4 embarquée

// Adresse e-mail comme la clé des limites (cleLimite) : minuscules, sans
// espaces autour. Pas une adresse (pas de @, espace, caractère de contrôle,
// trop longue) : vide. Un champ « email » rempli d'autre chose (un code collé
// au mauvais endroit) n'entre donc pas dans le journal.
export function normaliserEmail(valeur: unknown): string {
  if (typeof valeur !== "string") return "";
  const email = valeur.trim().toLowerCase();
  if (email.length > LONGUEUR_MAX_EMAIL) return "";
  return /^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+$/.test(email) ? email : "";
}

// Adresse IP : chiffres, lettres hexadécimales, « . » et « : » seulement
// (IPv4, IPv6). Toute autre valeur est écartée : l'en-tête vient du client.
export function normaliserIp(valeur: unknown): string | null {
  if (typeof valeur !== "string") return null;
  const ip = valeur.trim();
  if (ip === "" || ip.length > LONGUEUR_MAX_IP) return null;
  if (!/^[0-9a-fA-F.:]+$/.test(ip) || !/[.:]/.test(ip)) return null;
  return ip.toLowerCase();
}

// Adresse IP de la requête : premier élément de X-Forwarded-For (posé par
// Next et par le proxy de production), sinon X-Real-IP. INDICATIVE : sans
// proxy qui réécrit cet en-tête, le client peut le choisir.
export function lireIp(entetes: Headers | null | undefined): string | null {
  if (!entetes) return null;
  const transmis = entetes.get("x-forwarded-for")?.split(",")[0];
  return normaliserIp(transmis) ?? normaliserIp(entetes.get("x-real-ip"));
}

// En-tête User-Agent : caractères de contrôle retirés, tronqué.
export function normaliserNavigateur(valeur: unknown): string | null {
  if (typeof valeur !== "string") return null;
  const navigateur = valeur
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LONGUEUR_MAX_NAVIGATEUR);
  return navigateur === "" ? null : navigateur;
}

function estType(valeur: unknown): valeur is TypeEvenement {
  return TYPES_EVENEMENT.includes(valeur as TypeEvenement);
}

function estMotif(valeur: unknown): valeur is Motif {
  return MOTIFS.includes(valeur as Motif);
}

// Ligne prête à écrire, ou null si le type est inconnu. Seuls les champs
// d'Evenement sont repris, chacun nettoyé ; un motif inconnu devient « autre ».
export function preparerEvenement(
  evenement: Evenement,
  maintenant: Date,
): LigneJournal | null {
  if (!estType(evenement.type)) return null;
  const motif = evenement.motif == null ? null : estMotif(evenement.motif) ? evenement.motif : "autre";
  const utilisateurId =
    typeof evenement.utilisateurId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(evenement.utilisateurId)
      ? evenement.utilisateurId
      : null;
  return {
    type: evenement.type,
    email: normaliserEmail(evenement.email),
    utilisateurId,
    motif,
    ip: normaliserIp(evenement.ip),
    navigateur: normaliserNavigateur(evenement.navigateur),
    createdAt: maintenant,
  };
}

// --- Traduction des refus de Better Auth et de nos gardes ---

// Code de connexion refusé par /sign-in/email-otp (code d'erreur de l'APIError).
export function motifRefusCode(codeErreur: unknown): Motif {
  switch (codeErreur) {
    case "INVALID_OTP":
      return "code-incorrect";
    case "OTP_EXPIRED":
      return "code-expire";
    case "TOO_MANY_ATTEMPTS":
      return "code-epuise";
    default:
      return "autre";
  }
}

// --- Affichage (page /admin/journal) ---

export type TonEvenement = "succes" | "echec" | "alerte" | "neutre";

export const LIBELLES_TYPE: Record<TypeEvenement, { libelle: string; ton: TonEvenement }> = {
  CODE_DEMANDE: { libelle: "Code demandé", ton: "neutre" },
  CONNEXION_REUSSIE: { libelle: "Connexion réussie", ton: "succes" },
  CODE_REFUSE: { libelle: "Code refusé", ton: "echec" },
  COMPTE_BLOQUE: { libelle: "Compte bloqué", ton: "alerte" },
  DEUXIEME_FACTEUR_VALIDE: { libelle: "Second facteur validé", ton: "succes" },
  DEUXIEME_FACTEUR_REFUSE: { libelle: "Second facteur refusé", ton: "echec" },
  DECONNEXION: { libelle: "Déconnexion", ton: "neutre" },
  APPAREIL_DECONNECTE: { libelle: "Appareil déconnecté", ton: "neutre" },
  COMPTE_SUPPRIME: { libelle: "Compte supprimé", ton: "alerte" },
};

export const LIBELLES_MOTIF: Record<Motif, string> = {
  "code-incorrect": "code incorrect",
  "code-expire": "code expiré",
  "code-epuise": "3 essais faits sur ce code",
  "trop-de-codes-demandes": "trop de codes demandés",
  "trop-d-essais-de-code": "trop d'essais de code",
  "trop-d-essais-de-deuxieme-facteur": "trop d'essais de second facteur",
  application: "application d'authentification",
  "code-de-secours": "code de secours",
  "code-deja-utilise": "code déjà utilisé",
  "un-appareil": "depuis Mon profil",
  "autres-appareils": "tous les autres appareils",
  autre: "autre motif",
};

// Libellé d'un type lu en base (une valeur inconnue s'affiche telle quelle).
export function libelleType(type: string): { libelle: string; ton: TonEvenement } {
  return estType(type) ? LIBELLES_TYPE[type] : { libelle: type, ton: "neutre" };
}

export function libelleMotif(motif: string | null): string | null {
  if (motif === null) return null;
  return estMotif(motif) ? LIBELLES_MOTIF[motif] : LIBELLES_MOTIF.autre;
}

// Échec : ce que l'administrateur cherche d'abord.
export function estEchec(type: string): boolean {
  const { ton } = libelleType(type);
  return ton === "echec" || ton === "alerte";
}

// Filtre de la page : une partie de l'adresse suffit (« dupont », « @exemple.fr »).
// Vide ou trop long : pas de filtre.
export function normaliserFiltreEmail(saisie: unknown): string {
  if (typeof saisie !== "string") return "";
  const filtre = saisie.trim().toLowerCase();
  return filtre.length > LONGUEUR_MAX_EMAIL ? "" : filtre;
}
