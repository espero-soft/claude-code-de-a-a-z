// Importe des tickets d'exemple dans la base, pour l'écran /admin/tickets :
// chaque message est trié (trierTicket), sa réservation relue en base par le
// code, puis un brouillon de réponse est proposé (proposerReponse). Le ticket
// est enregistré au statut A_TRAITER. Rien n'est envoyé au client.
//
// Appelle la vraie API Claude (clé ANTHROPIC_API_KEY dans .env).
// Un message déjà importé (même e-mail, même texte) est ignoré : relancer le
// script ne crée pas de doublon et ne refait pas d'appel payant.
//
// Usage : npm run importer-tickets
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../src/lib/prisma";
import { trierTicket } from "../src/lib/tri-ticket";
import { proposerReponse, type ReservationLue } from "../src/lib/proposer-reponse";

type MessageExemple = { titre: string; email: string; message: string };

const EXEMPLES: MessageExemple[] = [
  {
    titre: "Annulation de Camille Martin",
    email: "camille@example.com",
    message:
      "Bonjour, j'ai réservé l'Agora pour le mardi 24 novembre à 14 h, mais notre réunion est reportée. " +
      "Je dois annuler : pouvez-vous me rembourser ?\n\nCamille Martin\ncamille@example.com",
  },
  {
    titre: "Question de paiement",
    email: "demo@example.com",
    message:
      "Bonjour, je vois deux prélèvements sur mon relevé pour la réservation de la salle Horizon. " +
      "Ai-je été débité deux fois ? Merci de vérifier.\n\nClient de démonstration",
  },
  {
    titre: "Demande de réservation sans compte",
    email: "nadia.benali@example.com",
    message:
      "Bonjour, je n'ai pas encore de compte chez vous. Je voudrais réserver une salle pour 8 personnes " +
      "jeudi prochain, de 10 h à 12 h. Comment dois-je m'y prendre ?\n\nNadia Benali",
  },
  {
    titre: "Message hors sujet",
    email: "jules.perrin@example.com",
    message:
      "Salut ! Vous connaissez un bon restaurant près du centre pour un déjeuner d'équipe vendredi ? " +
      "Plutôt italien si possible.\n\nJules",
  },
];

// La réservation est relue par le code (lecture seule), jamais fournie par le
// modèle : trierTicket n'a renvoyé qu'un identifiant vérifié.
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

async function importer(exemple: MessageExemple, client: Anthropic): Promise<string> {
  const { email, message } = exemple;
  const existant = await prisma.ticket.findFirst({ where: { email, message }, select: { id: true } });
  if (existant) return `déjà importé (${existant.id})`;

  const tri = await trierTicket(message, email, client);
  const reservation = await lireReservation(tri.reservationId);
  if (tri.reservationId !== null && reservation === null) {
    throw new Error(`réservation ${tri.reservationId} introuvable en base.`);
  }
  const reponse = await proposerReponse(message, tri, reservation, client);

  const ticket = await prisma.ticket.create({
    data: {
      message,
      email,
      categorie: tri.categorie,
      urgence: tri.urgence,
      resume: tri.resume,
      reservationId: tri.reservationId,
      brouillon: reponse.texte,
      aTransmettre: reponse.aTransmettre,
      motifTransmission: reponse.motifTransmission,
      statut: "A_TRAITER",
    },
    select: { id: true },
  });
  const conseiller = reponse.aTransmettre ? `, conseiller : ${reponse.motifTransmission}` : "";
  return `${tri.categorie}, urgence ${tri.urgence}, réservation ${tri.reservationId ?? "aucune"}${conseiller} -> ${ticket.id}`;
}

function messageErreur(erreur: unknown): string {
  if (erreur instanceof Anthropic.AuthenticationError) {
    return "clé API refusée : vérifier ANTHROPIC_API_KEY dans .env.";
  }
  if (erreur instanceof Anthropic.APIError) {
    return `erreur de l'API (${erreur.status}) : ${erreur.message}`;
  }
  return erreur instanceof Error ? erreur.message : String(erreur);
}

async function main() {
  const client = new Anthropic(); // lit ANTHROPIC_API_KEY dans l'environnement
  let echecs = 0;

  // Un message à la fois : un échec (brouillon refusé par un garde-fou, API
  // indisponible) n'empêche pas d'importer les autres.
  for (const exemple of EXEMPLES) {
    try {
      console.log(`[ok]    ${exemple.titre} : ${await importer(exemple, client)}`);
    } catch (erreur) {
      echecs++;
      console.error(`[échec] ${exemple.titre} : ${messageErreur(erreur)}`);
    }
  }

  console.log(`\n${EXEMPLES.length - echecs} ticket(s) sur ${EXEMPLES.length}. Voir /admin/tickets (npm run dev).`);
  if (echecs > 0) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
