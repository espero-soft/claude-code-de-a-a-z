// Règle R3 du cahier des charges : deux réservations confirmées ne peuvent pas
// se chevaucher sur la même salle. Seules les réservations CONFIRMEE bloquent
// un créneau ; une réservation EN_ATTENTE ou ANNULEE ne compte pas.

// Chemins relatifs : Vitest tourne sans configuration et ne connaît pas l'alias @/.
import type { StatutReservation } from "../generated/prisma/enums";
import { FUSEAU_CENTRE } from "./reservation";

export type Creneau = { debut: Date; fin: Date };

export type ReservationExistante = Creneau & {
  id: string;
  salleId: string;
  statut: StatutReservation;
};

const formatHeureParis = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU_CENTRE,
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});

// Heure du centre écrite « 10 h » ou « 10 h 30 ».
function heureLisible(date: Date): string {
  const parties = formatHeureParis.formatToParts(date);
  const heure = Number(parties.find((p) => p.type === "hour")?.value);
  const minute = parties.find((p) => p.type === "minute")?.value ?? "00";
  return minute === "00" ? `${heure} h` : `${heure} h ${minute}`;
}

// Message affiché au client : il indique l'horaire déjà pris pour qu'il
// sache quand la salle est libre.
export function messageCreneauPris(reserve: Creneau): string {
  return `Cette salle est déjà réservée de ${heureLisible(reserve.debut)} à ${heureLisible(reserve.fin)}. Choisissez un autre horaire.`;
}

// Créneaux semi-ouverts [debut, fin[ : deux créneaux qui se touchent
// (l'un finit à 10 h, l'autre commence à 10 h) ne se chevauchent pas.
export function chevauche(a: Creneau, b: Creneau): boolean {
  return (
    a.debut.getTime() < b.fin.getTime() && b.debut.getTime() < a.fin.getTime()
  );
}

// Première réservation confirmée de la même salle qui chevauche la demande,
// ou null si le créneau est libre. `demande.id` permet d'ignorer la
// réservation elle-même quand on vérifie au moment de la confirmer.
export function conflitConfirme(
  demande: Creneau & { salleId: string; id?: string },
  existantes: readonly ReservationExistante[],
): ReservationExistante | null {
  return (
    existantes.find(
      (r) =>
        r.statut === "CONFIRMEE" &&
        r.salleId === demande.salleId &&
        r.id !== demande.id &&
        chevauche(r, demande),
    ) ?? null
  );
}
