// Outil proposer_creneau_libre, exposé au modèle par les agents du support.
// Lecture seule : à partir d'un créneau souhaité, il propose jusqu'à trois
// créneaux libres de même durée, sans rien réserver.
//
// Les règles ne sont pas réécrites ici : chaque créneau candidat passe par
// validerReservation (R1, R2, R4) puis conflitConfirme (R3). La recherche
// elle-même (chercherCreneauxLibres) est une fonction pure : maintenant et les
// réservations confirmées sont injectés.
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  conflitConfirme,
  messageCreneauPris,
  type ReservationExistante,
} from "@/lib/chevauchement";
import { prisma } from "@/lib/prisma";
import { FUSEAU_CENTRE, heureDeParis, validerReservation } from "@/lib/reservation";

export const NOM_OUTIL_PROPOSER = "proposer_creneau_libre";

export const NOMBRE_CRENEAUX_MAX = 3;
const PAS_MIN = 30; // grille de recherche, alignée sur les tranches de R1
const JOURS_RECHERCHE = 14; // horizon : environ dix jours ouvrés
const MINUTES_PAR_JOUR = 24 * 60;

// strict : les arguments respectent exactement le schéma.
export const OUTIL_PROPOSER_CRENEAU: Anthropic.Tool = {
  name: NOM_OUTIL_PROPOSER,
  description:
    "Propose jusqu'à trois créneaux libres pour une salle, de la durée demandée : " +
    "d'abord à partir de l'heure souhaitée le jour souhaité, puis les jours ouvrés suivants, " +
    "par pas de 30 minutes (heure de Paris). Indique aussi si le créneau souhaité est libre " +
    "et, sinon, pourquoi. Chaque créneau respecte les règles du centre (au moins 1 h par " +
    "tranches de 30 min, du lundi au vendredi de 8 h à 20 h, pas dans le passé, pas de " +
    "chevauchement avec une réservation confirmée). Lecture seule : ne réserve rien.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      salle: {
        type: "string",
        description: "Identifiant ou slug de la salle (atelier, horizon, agora, conseil)",
      },
      date: { type: "string", description: "Date souhaitée, au format AAAA-MM-JJ" },
      heureDebut: { type: "string", description: "Heure de début souhaitée, au format HH:MM" },
      dureeMinutes: { type: "integer", description: "Durée en minutes (ex. 60, 90, 120)" },
    },
    required: ["salle", "date", "heureDebut", "dureeMinutes"],
    additionalProperties: false,
  },
};

const ArgumentsProposer = z.object({
  salle: z.string().min(1),
  date: z.string(),
  heureDebut: z.string(),
  dureeMinutes: z.number().int().positive(),
});
export type ArgumentsProposer = z.infer<typeof ArgumentsProposer>;

export type DemandeCreneauLibre = {
  salleId: string;
  date: string; // AAAA-MM-JJ
  heureDebut: string; // HH:MM, heure de Paris
  dureeMinutes: number;
};

export type CreneauPropose = { date: string; heureDebut: string; heureFin: string };

export type ResultatCreneaux = {
  demandeLibre: boolean;
  motif: string | null; // pourquoi le créneau demandé n'est pas possible
  creneaux: CreneauPropose[];
};

// --- Petits outils de calendrier (format, pas de règle métier) ---

const formatJourParis = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSEAU_CENTRE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Date du jour à Paris, au format AAAA-MM-JJ.
function aujourdhuiParis(maintenant: Date): string {
  return formatJourParis.format(maintenant);
}

function dateExiste(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [a, m, j] = date.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
}

function ajouterJours(date: string, jours: number): string {
  const [a, m, j] = date.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j + jours)).toISOString().slice(0, 10);
}

function enMinutes(heure: string): number | null {
  const c = /^(\d{2}):(\d{2})$/.exec(heure);
  return c ? Number(c[1]) * 60 + Number(c[2]) : null;
}

function enHeure(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

// --- Recherche (pure) ---

// Motif de refus d'un créneau, ou null s'il est libre : R1, R2, R4 par
// validerReservation, puis R3 par conflitConfirme.
function motifRefus(
  salleId: string,
  creneau: CreneauPropose,
  maintenant: Date,
  confirmees: readonly ReservationExistante[],
): string | null {
  const validation = validerReservation(
    // Nom et e-mail ne servent pas ici : valeurs factices valides.
    { ...creneau, nomClient: "proposition", emailClient: "proposition@exemple.fr" },
    maintenant,
  );
  if (!validation.ok) {
    const { date, heureDebut, heureFin, general } = validation.erreurs;
    return date ?? heureDebut ?? heureFin ?? general ?? "Créneau impossible.";
  }
  const conflit = conflitConfirme(
    { salleId, debut: validation.debut, fin: validation.fin },
    confirmees,
  );
  return conflit ? messageCreneauPris(conflit) : null;
}

// Jusqu'à trois créneaux libres de la durée demandée : à partir de l'heure
// demandée le jour demandé (ou d'aujourd'hui si ce jour est passé), puis les
// jours suivants, par pas de 30 minutes. Les jours fermés et les heures hors
// ouverture sont écartés par validerReservation.
export function chercherCreneauxLibres(
  demande: DemandeCreneauLibre,
  maintenant: Date,
  confirmees: readonly ReservationExistante[],
): ResultatCreneaux {
  const { salleId, dureeMinutes } = demande;
  const debutDemande = enMinutes(demande.heureDebut);
  const finDemande =
    debutDemande === null ? demande.heureDebut : enHeure(debutDemande + dureeMinutes);
  const motif = motifRefus(
    salleId,
    { date: demande.date, heureDebut: demande.heureDebut, heureFin: finDemande },
    maintenant,
    confirmees,
  );

  const creneaux: CreneauPropose[] = [];
  if (!dateExiste(demande.date)) {
    return { demandeLibre: false, motif, creneaux };
  }

  const aujourdhui = aujourdhuiParis(maintenant);
  const datePassee = demande.date < aujourdhui;
  const premierJour = datePassee ? aujourdhui : demande.date;
  // Première heure du premier jour, arrondie à la demi-heure supérieure.
  const departPremierJour =
    datePassee || debutDemande === null ? 0 : Math.ceil(debutDemande / PAS_MIN) * PAS_MIN;

  for (let i = 0; i < JOURS_RECHERCHE && creneaux.length < NOMBRE_CRENEAUX_MAX; i++) {
    const date = ajouterJours(premierJour, i);
    const depart = i === 0 ? departPremierJour : 0;
    for (
      let debut = depart;
      debut + dureeMinutes < MINUTES_PAR_JOUR && creneaux.length < NOMBRE_CRENEAUX_MAX;
      debut += PAS_MIN
    ) {
      const candidat = {
        date,
        heureDebut: enHeure(debut),
        heureFin: enHeure(debut + dureeMinutes),
      };
      if (motifRefus(salleId, candidat, maintenant, confirmees) === null) {
        creneaux.push(candidat);
      }
    }
  }

  return { demandeLibre: motif === null, motif, creneaux };
}

// --- Accès à la base (lecture seule) ---

export type PropositionCreneaux = ResultatCreneaux & { salle: string };

// Uniquement des lectures : la salle (active), puis ses réservations
// confirmées qui ne sont pas encore terminées.
export async function proposerCreneauLibre(
  args: ArgumentsProposer,
  maintenant: Date = new Date(),
): Promise<PropositionCreneaux> {
  const salle = await prisma.salle.findFirst({
    where: { active: true, OR: [{ id: args.salle }, { slug: args.salle }] },
    select: { id: true, nom: true },
  });
  if (!salle) {
    throw new Error(`Salle introuvable : ${args.salle}`);
  }
  // Fin de l'horizon de recherche : inutile de lire les réservations au-delà.
  const aujourdhui = aujourdhuiParis(maintenant);
  const premierJour =
    dateExiste(args.date) && args.date > aujourdhui ? args.date : aujourdhui;
  const debutMax = heureDeParis(ajouterJours(premierJour, JOURS_RECHERCHE + 1), "00:00");
  const confirmees = await prisma.reservation.findMany({
    where: {
      salleId: salle.id,
      statut: "CONFIRMEE",
      fin: { gt: maintenant },
      debut: { lt: debutMax },
    },
    select: { id: true, salleId: true, statut: true, debut: true, fin: true },
  });
  const resultat = chercherCreneauxLibres(
    { salleId: salle.id, date: args.date, heureDebut: args.heureDebut, dureeMinutes: args.dureeMinutes },
    maintenant,
    confirmees,
  );
  return { salle: salle.nom, ...resultat };
}

// Exécute un appel d'outil du modèle. Une erreur (outil inconnu, arguments
// invalides, salle introuvable, base indisponible) est renvoyée au modèle
// avec is_error, pas levée.
export async function executerOutilProposer(
  bloc: Anthropic.ToolUseBlock,
  maintenant: Date = new Date(),
): Promise<{ resultat: Anthropic.ToolResultBlockParam; proposition: PropositionCreneaux | null }> {
  try {
    if (bloc.name !== NOM_OUTIL_PROPOSER) {
      throw new Error(`Outil inconnu : ${bloc.name}`);
    }
    const args = ArgumentsProposer.parse(bloc.input);
    const proposition = await proposerCreneauLibre(args, maintenant);
    return {
      resultat: { type: "tool_result", tool_use_id: bloc.id, content: JSON.stringify(proposition) },
      proposition,
    };
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    return {
      resultat: { type: "tool_result", tool_use_id: bloc.id, content: message, is_error: true },
      proposition: null,
    };
  }
}
