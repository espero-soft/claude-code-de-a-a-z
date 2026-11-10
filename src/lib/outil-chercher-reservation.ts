// Outil chercher_reservation, exposé au modèle par les agents du support
// (scripts/agent-outil.ts, trierTicket). Lecture seule : il retrouve les
// réservations d'un client par son e-mail et ne modifie rien.
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { FUSEAU_CENTRE } from "@/lib/reservation";

export const NOM_OUTIL_CHERCHER = "chercher_reservation";

// strict : les arguments respectent exactement le schéma.
export const OUTIL_CHERCHER_RESERVATION: Anthropic.Tool = {
  name: NOM_OUTIL_CHERCHER,
  description:
    "Renvoie les réservations d'un client, retrouvé par son adresse e-mail : " +
    "identifiant, salle, début et fin (heure de Paris), statut et montant en euros. " +
    "Lecture seule : ne modifie rien.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      email: { type: "string", description: "Adresse e-mail du client" },
    },
    required: ["email"],
    additionalProperties: false,
  },
};

const ArgumentsChercher = z.object({ email: z.string() });

export type ReservationTrouvee = {
  id: string;
  salle: string;
  debut: string;
  fin: string;
  statut: string;
  montant: string;
};

const formatDate = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU_CENTRE,
  dateStyle: "full",
  timeStyle: "short",
});
const formatEuros = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

// Uniquement findMany, avec les champs utiles (rien de Stripe).
export async function chercherReservation(email: string): Promise<ReservationTrouvee[]> {
  const reservations = await prisma.reservation.findMany({
    where: { emailClient: email.trim().toLowerCase() },
    orderBy: { debut: "asc" },
    select: {
      id: true,
      debut: true,
      fin: true,
      statut: true,
      montantTotalCentimes: true,
      salle: { select: { nom: true } },
    },
  });
  return reservations.map((r) => ({
    id: r.id,
    salle: r.salle.nom,
    debut: formatDate.format(r.debut),
    fin: formatDate.format(r.fin),
    statut: r.statut,
    montant: formatEuros.format(r.montantTotalCentimes / 100),
  }));
}

// Exécute un appel d'outil du modèle. Une erreur (outil inconnu, arguments
// invalides, base indisponible) est renvoyée au modèle avec is_error, pas levée.
export async function executerOutilChercher(
  bloc: Anthropic.ToolUseBlock,
): Promise<{ resultat: Anthropic.ToolResultBlockParam; reservations: ReservationTrouvee[] }> {
  try {
    if (bloc.name !== NOM_OUTIL_CHERCHER) {
      throw new Error(`Outil inconnu : ${bloc.name}`);
    }
    const { email } = ArgumentsChercher.parse(bloc.input);
    const reservations = await chercherReservation(email);
    return {
      resultat: { type: "tool_result", tool_use_id: bloc.id, content: JSON.stringify(reservations) },
      reservations,
    };
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    return {
      resultat: { type: "tool_result", tool_use_id: bloc.id, content: message, is_error: true },
      reservations: [],
    };
  }
}
