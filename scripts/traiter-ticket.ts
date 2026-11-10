// Traitement complet d'un ticket du support, de bout en bout : trierTicket
// (catégorie, urgence, réservation concernée), puis lecture de la réservation en
// base par le code, puis proposerReponse (brouillon relu par un conseiller).
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

const EMAIL_CLIENTE = "camille@example.com";
const MESSAGE_CLIENTE =
  "Bonjour, j'ai réservé l'Agora pour le mardi 24 novembre à 14 h, mais notre réunion est reportée. " +
  "Je dois annuler : pouvez-vous me rembourser ?\n\n" +
  `Camille Martin\n${EMAIL_CLIENTE}`;

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

async function main() {
  const client = new Anthropic(); // lit ANTHROPIC_API_KEY dans l'environnement

  console.log("=== Message de la cliente ===");
  console.log(MESSAGE_CLIENTE);

  const tri = await trierTicket(MESSAGE_CLIENTE, EMAIL_CLIENTE, client);
  console.log("\n=== Tri ===");
  console.log(`Catégorie      : ${tri.categorie}`);
  console.log(`Urgence        : ${tri.urgence}`);
  console.log(`Réservation    : ${tri.reservationId ?? "aucune"}`);
  console.log(`Résumé         : ${tri.resume}`);

  const reservation = await lireReservation(tri.reservationId);
  if (tri.reservationId !== null && reservation === null) {
    throw new Error(`Réservation ${tri.reservationId} introuvable en base.`);
  }

  const reponse = await proposerReponse(MESSAGE_CLIENTE, tri, reservation, client);
  console.log("\n=== Brouillon (non envoyé) ===");
  console.log(reponse.texte);
  console.log("\n=== Suite à donner ===");
  console.log(`Statut         : ${reponse.statut}`);
  console.log(
    `Conseiller     : ${
      reponse.aTransmettre ? `à transmettre (${reponse.motifTransmission})` : "non nécessaire"
    }`,
  );
}

main()
  .catch((erreur) => {
    if (erreur instanceof ErreurTriTicket || erreur instanceof ErreurReponseProposee) {
      console.error(erreur.message);
    } else if (erreur instanceof Anthropic.AuthenticationError) {
      console.error("Clé API refusée : vérifier ANTHROPIC_API_KEY dans .env.");
    } else if (erreur instanceof Anthropic.APIError) {
      console.error(`Erreur de l'API (${erreur.status}) : ${erreur.message}`);
    } else {
      console.error(erreur);
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
