// Vérifie un créneau contre R1, R2 et R4 en réutilisant validerReservation,
// sans dupliquer les règles : seules les erreurs sur la date et les heures
// sont retenues (le nom et l'e-mail du client ne concernent pas le créneau).

import { validerReservation } from "@/lib/reservation";

export type Regle = "R1" | "R2" | "R4";

export type ErreurCreneau = {
  champ: "date" | "heureDebut" | "heureFin";
  // null : saisie mal formée (date ou heure absente ou invalide), aucune règle en cause.
  regle: Regle | null;
  message: string;
};

export type VerdictCreneau = {
  respecte: boolean;
  erreurs: ErreurCreneau[];
};

export type Creneau = { date: string; heureDebut: string; heureFin: string };

// validerReservation ne renvoie qu'un message par champ : on retrouve la règle
// en cause d'après ce message (les tests couvrent chaque message possible).
function regleDuMessage(message: string): Regle | null {
  if (/déjà passée/.test(message)) return "R4";
  if (/lundi au vendredi|ouvre à|ferme à/.test(message)) return "R2";
  if (/demi-heure|au moins 1 heure|après l'heure de début/.test(message)) return "R1";
  return null;
}

const CHAMPS_CRENEAU = ["date", "heureDebut", "heureFin"] as const;

export function verifierCreneau(creneau: Creneau, maintenant: Date): VerdictCreneau {
  const resultat = validerReservation(
    // Client fictif mais valide, pour n'obtenir que les erreurs du créneau.
    { ...creneau, nomClient: "Vérification", emailClient: "verification@exemple.fr" },
    maintenant,
  );
  if (resultat.ok) return { respecte: true, erreurs: [] };

  const erreurs: ErreurCreneau[] = [];
  for (const champ of CHAMPS_CRENEAU) {
    const message = resultat.erreurs[champ];
    if (message) erreurs.push({ champ, regle: regleDuMessage(message), message });
  }
  return { respecte: erreurs.length === 0, erreurs };
}
