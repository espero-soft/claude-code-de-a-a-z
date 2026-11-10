// Traitement complet de tickets du support, de bout en bout : trierTicket
// (catégorie, urgence, réservation concernée), puis lecture de la réservation en
// base par le code, puis proposerReponse (brouillon relu par un conseiller), qui
// peut appeler l'outil proposer_creneau_libre pour une demande de réservation.
//
// Lecture seule : rien n'est envoyé au client et rien n'est écrit en base.
//
// Usage : npm run traiter-ticket
// La clé est lue dans .env (ANTHROPIC_API_KEY), la base dans DATABASE_URL.
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../src/lib/prisma";
import { trierTicket, ErreurTriTicket } from "../src/lib/tri-ticket";
import {
  proposerReponse,
  ErreurReponseProposee,
  type ReservationLue,
} from "../src/lib/proposer-reponse";

type Ticket = { email: string; message: string };

const TICKETS: Ticket[] = [
  {
    email: "camille@example.com",
    message:
      "Bonjour, j'ai réservé l'Agora pour le mardi 24 novembre à 14 h, mais notre réunion est reportée. " +
      "Je dois annuler : pouvez-vous me rembourser ?\n\n" +
      "Camille Martin\ncamille@example.com",
  },
  {
    email: "lea.roux@example.com",
    message:
      "Bonjour, je voudrais réserver l'Agora le mardi 24 novembre de 14 h à 16 h pour une réunion " +
      "de 8 personnes. Est-ce possible ?\n\n" +
      "Léa Roux\nlea.roux@example.com",
  },
];

// La réservation est relue par le code (findUnique, lecture seule), jamais
// fournie par le modèle : trierTicket n'a renvoyé qu'un identifiant vérifié.
async function lireReservation(id: string | null): Promise<ReservationLue | null> {
  if (id === null) return null;
  return prisma.reservation.findUnique({
    where: { id },
    select: {
      id: true,
      debut: true,
      fin: true,
      statut: true,
      montantTotalCentimes: true,
      salle: { select: { nom: true } },
    },
  });
}

async function traiter(ticket: Ticket, client: Anthropic): Promise<void> {
  console.log("=== Message du client ===");
  console.log(ticket.message);

  const tri = await trierTicket(ticket.message, ticket.email, client);
  console.log("\n=== Tri ===");
  console.log(`Catégorie      : ${tri.categorie}`);
  console.log(`Urgence        : ${tri.urgence}`);
  console.log(`Réservation    : ${tri.reservationId ?? "aucune"}`);
  console.log(`Résumé         : ${tri.resume}`);

  const reservation = await lireReservation(tri.reservationId);
  if (tri.reservationId !== null && reservation === null) {
    throw new Error(`Réservation ${tri.reservationId} introuvable en base.`);
  }

  const reponse = await proposerReponse(ticket.message, tri, reservation, client, {
    surAppelOutil: (bloc, resultat) => {
      console.log(`\nAppel d'outil  : ${bloc.name} ${JSON.stringify(bloc.input)}`);
      console.log(`  -> ${resultat.is_error ? "erreur : " : ""}${resultat.content}`);
    },
  });
  console.log("\n=== Brouillon (non envoyé) ===");
  console.log(reponse.texte);
  console.log("\n=== Suite à donner ===");
  console.log(`Statut         : ${reponse.statut}`);
  console.log(
    `Conseiller     : ${
      reponse.aTransmettre ? `à transmettre (${reponse.motifTransmission})` : "non nécessaire"
    }`,
  );
  if (reponse.creneauxProposes.length > 0) {
    const liste = reponse.creneauxProposes
      .map((c) => `${c.date} ${c.heureDebut}-${c.heureFin}`)
      .join(", ");
    console.log(`Créneaux outil : ${liste}`);
  }
}

function afficherErreur(erreur: unknown): void {
  if (erreur instanceof ErreurTriTicket || erreur instanceof ErreurReponseProposee) {
    console.error(erreur.message);
  } else if (erreur instanceof Anthropic.AuthenticationError) {
    console.error("Clé API refusée : vérifier ANTHROPIC_API_KEY dans .env.");
  } else if (erreur instanceof Anthropic.APIError) {
    console.error(`Erreur de l'API (${erreur.status}) : ${erreur.message}`);
  } else {
    console.error(erreur);
  }
}

async function main() {
  const client = new Anthropic(); // lit ANTHROPIC_API_KEY dans l'environnement
  // Un ticket en échec n'empêche pas de traiter les suivants.
  for (const [i, ticket] of TICKETS.entries()) {
    if (i > 0) console.log(`\n${"-".repeat(60)}\n`);
    try {
      await traiter(ticket, client);
    } catch (erreur) {
      afficherErreur(erreur);
      process.exitCode = 1;
    }
  }
}

main().finally(() => prisma.$disconnect());
