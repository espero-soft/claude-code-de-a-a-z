// Règles du cahier des charges appliquées à une demande de réservation :
// R1 (au moins 1 h, par tranches de 30 min), R2 (lundi au vendredi, 8 h à 20 h)
// et R4 (pas dans le passé). Les heures sont celles du centre, à Paris, quel
// que soit le fuseau du serveur.

export const FUSEAU_CENTRE = "Europe/Paris";

const OUVERTURE_MIN = 8 * 60;
const FERMETURE_MIN = 20 * 60;
const DUREE_MIN_MIN = 30;

export type SaisieReservation = {
  date: string;
  heureDebut: string;
  heureFin: string;
  nomClient: string;
  emailClient: string;
};

export type ErreursReservation = Partial<
  Record<keyof SaisieReservation | "general", string>
>;

export type ResultatValidation =
  | { ok: true; debut: Date; fin: Date; nomClient: string; emailClient: string }
  | { ok: false; erreurs: ErreursReservation };

const formatParis = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSEAU_CENTRE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

// Heure murale de Paris de l'instant donné, relue comme si c'était de l'UTC.
function murParisCommeUtc(instant: number): number {
  const parties = Object.fromEntries(
    formatParis.formatToParts(instant).map((p) => [p.type, p.value]),
  );
  return Date.UTC(
    Number(parties.year),
    Number(parties.month) - 1,
    Number(parties.day),
    Number(parties.hour),
    Number(parties.minute),
    Number(parties.second),
  );
}

// "2026-11-10" + "09:00" (heure de Paris) → instant correspondant.
export function heureDeParis(date: string, heure: string): Date {
  const [a, m, j] = date.split("-").map(Number);
  const [h, min] = heure.split(":").map(Number);
  const voulu = Date.UTC(a, m - 1, j, h, min);
  // Deux passes : la seconde corrige le cas d'un changement d'heure.
  let instant = voulu - (murParisCommeUtc(voulu) - voulu);
  instant += voulu - murParisCommeUtc(instant);
  return new Date(instant);
}

// Jour de la semaine (0 = dimanche) d'une date "AAAA-MM-JJ", ou null si elle
// n'existe pas (ex. 2026-02-31).
function jourDeLaSemaine(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [a, m, j] = date.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== j) {
    return null;
  }
  return d.getUTCDay();
}

// "09:30" → 570, ou null si le format est invalide.
function enMinutes(heure: string): number | null {
  const correspondance = /^(\d{2}):(\d{2})$/.exec(heure);
  if (!correspondance) return null;
  const h = Number(correspondance[1]);
  const min = Number(correspondance[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const MESSAGE_DEMI_HEURE =
  "Choisissez une heure pleine ou une demi-heure (ex. 9:00 ou 9:30).";

export function validerReservation(
  saisie: SaisieReservation,
  maintenant: Date,
): ResultatValidation {
  const erreurs: ErreursReservation = {};
  const nomClient = saisie.nomClient.trim();
  const emailClient = saisie.emailClient.trim();

  if (!nomClient) {
    erreurs.nomClient = "Indiquez votre nom.";
  }
  if (!emailClient) {
    erreurs.emailClient = "Indiquez votre adresse e-mail.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClient)) {
    erreurs.emailClient = "Cette adresse e-mail n'est pas valide.";
  }

  // R2 : jours d'ouverture.
  const jour = jourDeLaSemaine(saisie.date);
  if (!saisie.date) {
    erreurs.date = "Choisissez une date.";
  } else if (jour === null) {
    erreurs.date = "Cette date n'est pas valide.";
  } else if (jour === 0 || jour === 6) {
    erreurs.date = "Le centre est ouvert du lundi au vendredi.";
  }

  // R1 (tranches de 30 min) et R2 (horaires d'ouverture) sur chaque heure.
  const debutMin = enMinutes(saisie.heureDebut);
  if (!saisie.heureDebut) {
    erreurs.heureDebut = "Choisissez une heure de début.";
  } else if (debutMin === null) {
    erreurs.heureDebut = "Cette heure n'est pas valide.";
  } else if (debutMin % 30 !== 0) {
    erreurs.heureDebut = MESSAGE_DEMI_HEURE;
  } else if (debutMin < OUVERTURE_MIN) {
    erreurs.heureDebut = "Le centre ouvre à 8 h.";
  } else if (debutMin >= FERMETURE_MIN) {
    erreurs.heureDebut = "Le centre ferme à 20 h.";
  }

  const finMin = enMinutes(saisie.heureFin);
  if (!saisie.heureFin) {
    erreurs.heureFin = "Choisissez une heure de fin.";
  } else if (finMin === null) {
    erreurs.heureFin = "Cette heure n'est pas valide.";
  } else if (finMin % 30 !== 0) {
    erreurs.heureFin = MESSAGE_DEMI_HEURE;
  } else if (finMin > FERMETURE_MIN) {
    erreurs.heureFin = "Le centre ferme à 20 h.";
  } else if (debutMin !== null && finMin <= debutMin) {
    erreurs.heureFin = "L'heure de fin doit être après l'heure de début.";
  } else if (debutMin !== null && finMin - debutMin < DUREE_MIN_MIN) {
    // R1 : durée minimale.
    erreurs.heureFin = "Une réservation dure au moins 1 heure.";
  }

  if (erreurs.date || erreurs.heureDebut || erreurs.heureFin) {
    return { ok: false, erreurs };
  }

  const debut = heureDeParis(saisie.date, saisie.heureDebut);
  const fin = heureDeParis(saisie.date, saisie.heureFin);

  // R4 : pas dans le passé.
  if (debut.getTime() <= maintenant.getTime()) {
    const memeJour = heureDeParis(saisie.date, "23:59").getTime() >= maintenant.getTime();
    if (memeJour) {
      erreurs.heureDebut = "Cette heure est déjà passée.";
    } else {
      erreurs.date = "Cette date est déjà passée.";
    }
  }

  if (Object.keys(erreurs).length > 0) {
    return { ok: false, erreurs };
  }
  return { ok: true, debut, fin, nomClient, emailClient };
}
