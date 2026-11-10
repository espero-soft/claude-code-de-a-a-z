// Rôles et règles d'accès (module 12, SECURITE.md sections 2 et 4).
// Fonctions pures, testées dans roles.test.ts : aucune lecture de session ici
// (voir src/lib/acces.ts). Refus par défaut : ce qui n'est pas prévu est
// interdit.

export const ROLES = ["CLIENT", "EMPLOYE", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

// Rôle d'un compte créé par la connexion par code.
export const ROLE_PAR_DEFAUT: Role = "CLIENT";

// Ce que l'on peut faire dans l'application, rôle par rôle.
// - reserver : réserver et payer ses propres réservations ;
// - reservations : consulter les réservations de tous les clients ;
// - tickets : lire et valider les tickets du support ;
// - chiffres : chiffre d'affaires, taux de remplissage (à venir) ;
// - comptes : gérer les comptes et leurs rôles (à venir) ;
// - journal : lire le journal des connexions (/admin/journal), qui montre
//   les adresses IP et les échecs de tous les comptes, personnel compris.
export type Capacite = "reserver" | "reservations" | "tickets" | "chiffres" | "comptes" | "journal";

const CAPACITES: Record<Role, readonly Capacite[]> = {
  CLIENT: ["reserver"],
  // L'employé traite le support : réservations et tickets, mais ni les
  // chiffres ni les comptes.
  EMPLOYE: ["reserver", "reservations", "tickets"],
  ADMIN: ["reserver", "reservations", "tickets", "chiffres", "comptes", "journal"],
};

// Rôle lu en base : toute valeur inattendue (vide, minuscules, rôle inventé)
// vaut client, le rôle le moins puissant.
export function lireRole(valeur: unknown): Role {
  return ROLES.find((role) => role === valeur) ?? ROLE_PAR_DEFAUT;
}

export function peut(role: Role, capacite: Capacite): boolean {
  return CAPACITES[role].includes(capacite);
}

// Le personnel du centre : il entre dans /admin.
export function estPersonnel(role: Role): boolean {
  return peut(role, "tickets") || peut(role, "comptes");
}

// Capacité exigée par une page de /admin (utilisée par le proxy, doublée
// dans chaque page). Une page inconnue exige la plus forte : refus par défaut.
export function capacitePageAdmin(chemin: string): Capacite {
  if (chemin === "/admin/tickets" || chemin.startsWith("/admin/tickets/")) return "tickets";
  if (chemin === "/admin") return "tickets";
  if (chemin === "/admin/journal" || chemin.startsWith("/admin/journal/")) return "journal";
  return "comptes";
}

// --- Second facteur (TOTP) du personnel ---
// L'employé et l'administrateur lisent les données de tous les clients : le
// code reçu par e-mail ne leur suffit pas (SECURITE.md, section 13).

export function exigeDeuxiemeFacteur(role: Role): boolean {
  return role === "EMPLOYE" || role === "ADMIN";
}

// Une validation vaut pour la session où elle a eu lieu, et pas plus de
// 12 heures (une journée de travail) : au-delà, on redemande un code.
export const DUREE_DEUXIEME_FACTEUR_MS = 12 * 60 * 60 * 1000;

export function deuxiemeFacteurRecent(valideLe: Date | null, maintenant: Date): boolean {
  if (!valideLe) return false;
  const ecart = maintenant.getTime() - valideLe.getTime();
  // Une date dans le futur n'est pas crédible : refusée.
  return ecart >= 0 && ecart < DUREE_DEUXIEME_FACTEUR_MS;
}

export type EtatDeuxiemeFacteur =
  | "inutile" // client : pas de second facteur
  | "a-enroler" // personnel sans application configurée
  | "a-verifier" // personnel enrôlé, code pas encore saisi dans cette session
  | "valide"; // personnel, code saisi dans cette session depuis moins de 12 h

export function etatDeuxiemeFacteur(
  role: Role,
  facteur: { enrole: boolean; valideLe: Date | null },
  maintenant: Date,
): EtatDeuxiemeFacteur {
  if (!exigeDeuxiemeFacteur(role)) return "inutile";
  if (!facteur.enrole) return "a-enroler";
  return deuxiemeFacteurRecent(facteur.valideLe, maintenant) ? "valide" : "a-verifier";
}

// Rôle qui ouvre les droits. Tant que le second facteur n'est pas validé, un
// employé ou un administrateur n'a que les droits d'un client : /admin, les
// réservations des autres et les actions du personnel restent fermés, sans
// avoir à y penser dans chaque contrôle.
export function roleEffectif(role: Role, etat: EtatDeuxiemeFacteur): Role {
  return exigeDeuxiemeFacteur(role) && etat !== "valide" ? "CLIENT" : role;
}

export type UtilisateurAcces = { id: string; role: Role };

// Une réservation est visible par son titulaire (le compte qui l'a créée), et
// par le personnel qui consulte les réservations. Une réservation sans
// titulaire (créée avant les comptes) n'est visible que du personnel.
// Aux autres, on répond comme pour une réservation inexistante.
export function peutVoirReservation(
  utilisateur: UtilisateurAcces | null,
  reservation: { utilisateurId: string | null },
): boolean {
  if (!utilisateur) return false;
  if (peut(utilisateur.role, "reservations")) return true;
  return estTitulaire(utilisateur, reservation);
}

// Payer engage le titulaire seul : le personnel consulte, il ne paie pas à
// la place du client.
export function peutPayerReservation(
  utilisateur: UtilisateurAcces | null,
  reservation: { utilisateurId: string | null },
): boolean {
  if (!utilisateur || !peut(utilisateur.role, "reserver")) return false;
  return estTitulaire(utilisateur, reservation);
}

function estTitulaire(utilisateur: UtilisateurAcces, reservation: { utilisateurId: string | null }) {
  return reservation.utilisateurId !== null && reservation.utilisateurId === utilisateur.id;
}

// Adresse du premier administrateur, passée à la commande `npm run
// admin:creer -- <e-mail>` (ou ADMIN_EMAIL) : jamais écrite dans le code.
// Renvoie l'adresse normalisée (minuscules, sans espaces autour), ou null.
export function adresseAdmin(valeur: string | undefined): string | null {
  const adresse = valeur?.trim().toLowerCase() ?? "";
  // Même exigence minimale que la connexion : un @ entre deux parties non
  // vides, un point dans le domaine, pas d'espace.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse) ? adresse : null;
}

export type DecisionPremierAdmin =
  | { action: "creer" } // aucun compte à cette adresse : on le crée, administrateur
  | { action: "promouvoir" } // le compte existe : il devient administrateur
  | { action: "rien" } // c'est déjà lui l'administrateur
  | { action: "refuser"; administrateurs: string[] };

// La commande ne crée que le PREMIER administrateur : dès qu'il en existe un
// autre, elle refuse (sinon quiconque lance un script sur le serveur
// s'ajouterait des droits sans trace). Les suivants seront nommés par un
// administrateur, depuis l'application.
export function decisionPremierAdmin(
  adresse: string,
  compte: { role: Role } | null,
  administrateurs: readonly string[],
): DecisionPremierAdmin {
  const autres = administrateurs.filter((email) => email.toLowerCase() !== adresse);
  if (autres.length > 0) return { action: "refuser", administrateurs: autres };
  if (compte?.role === "ADMIN") return { action: "rien" };
  return compte ? { action: "promouvoir" } : { action: "creer" };
}
