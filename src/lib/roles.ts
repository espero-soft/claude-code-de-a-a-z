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
// - comptes : gérer les comptes et leurs rôles (à venir).
export type Capacite = "reserver" | "reservations" | "tickets" | "chiffres" | "comptes";

const CAPACITES: Record<Role, readonly Capacite[]> = {
  CLIENT: ["reserver"],
  // L'employé traite le support : réservations et tickets, mais ni les
  // chiffres ni les comptes.
  EMPLOYE: ["reserver", "reservations", "tickets"],
  ADMIN: ["reserver", "reservations", "tickets", "chiffres", "comptes"],
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
