// Deuxième étape : donner un outil au modèle. Le modèle reçoit le message d'une
// cliente et peut appeler chercher_reservation pour retrouver ses réservations en
// base (lecture seule). La boucle est écrite à la main : tant que le modèle
// demande l'outil, on l'exécute et on lui renvoie le résultat. On affiche chaque
// appel d'outil, puis la réponse finale : catégorie, urgence, réservation concernée.
//
// Usage : npm run agent-outil
// La clé est lue dans .env (ANTHROPIC_API_KEY), la base dans DATABASE_URL.
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { prisma } from "../src/lib/prisma";
import {
  OUTIL_CHERCHER_RESERVATION,
  executerOutilChercher,
} from "../src/lib/outil-chercher-reservation";

const MODELE = "claude-haiku-5-5";
const TOURS_MAX = 5; // garde-fou : pas de boucle infinie si le modèle insiste

const CONSIGNE =
  "Tu tries les messages des clients d'un centre d'affaires qui loue des salles de réunion. " +
  "Avant de répondre, utilise l'outil chercher_reservation avec l'e-mail du client " +
  "pour retrouver ses réservations, puis identifie celle dont parle le message. " +
  "Donne la catégorie du message (réservation, paiement, annulation ou autre), " +
  "son urgence (basse, moyenne ou haute) et la réservation concernée " +
  "(null si aucune ne correspond).";

const MESSAGE_CLIENTE =
  "Bonjour, j'ai réservé l'Agora pour le mardi 24 novembre à 14 h, mais notre réunion est reportée. " +
  "Je dois annuler : pouvez-vous me rembourser ?\n\n" +
  "Camille Martin\ncamille@example.com";

// Réponse finale attendue, contrainte par les sorties structurées.
const ReponseFinale = z.object({
  categorie: z.enum(["réservation", "paiement", "annulation", "autre"]),
  urgence: z.enum(["basse", "moyenne", "haute"]),
  reservationConcernee: z
    .object({ id: z.string(), description: z.string() })
    .nullable(),
});

// L'outil lui-même vit dans src/lib (partagé avec trierTicket) ; ici, on affiche
// seulement chaque appel et son résultat.
async function executerOutil(
  bloc: Anthropic.ToolUseBlock,
): Promise<Anthropic.ToolResultBlockParam> {
  console.log(`Appel d'outil  : ${bloc.name} ${JSON.stringify(bloc.input)}`);
  const { resultat, reservations } = await executerOutilChercher(bloc);
  console.log(
    resultat.is_error
      ? `  -> erreur : ${resultat.content}`
      : `  -> ${reservations.length} réservation(s) trouvée(s)`,
  );
  return resultat;
}

async function main() {
  const client = new Anthropic(); // lit ANTHROPIC_API_KEY dans l'environnement
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: MESSAGE_CLIENTE },
  ];

  for (let tour = 1; tour <= TOURS_MAX; tour++) {
    const reponse = await client.messages.parse({
      model: MODELE,
      max_tokens: 4096,
      output_config: { effort: "low", format: zodOutputFormat(ReponseFinale) },
      system: CONSIGNE,
      tools: [OUTIL_CHERCHER_RESERVATION],
      messages,
    });

    if (reponse.stop_reason === "refusal") {
      console.error("Le modèle a refusé de répondre.", reponse.stop_details ?? "");
      process.exit(1);
    }
    if (reponse.stop_reason === "max_tokens") {
      console.error("Réponse tronquée (max_tokens atteint).");
      process.exit(1);
    }

    if (reponse.stop_reason === "tool_use") {
      // On rend au modèle sa réponse complète, puis tous les résultats d'outils
      // dans un seul message utilisateur.
      messages.push({ role: "assistant", content: reponse.content });
      const appels = reponse.content.filter(
        (bloc): bloc is Anthropic.ToolUseBlock => bloc.type === "tool_use",
      );
      const resultats = await Promise.all(appels.map(executerOutil));
      messages.push({ role: "user", content: resultats });
      continue;
    }

    const finale = reponse.parsed_output;
    if (!finale) {
      console.error("Réponse finale illisible :", JSON.stringify(reponse.content));
      process.exit(1);
    }
    const concernee = finale.reservationConcernee;
    console.log("");
    console.log(`Catégorie      : ${finale.categorie}`);
    console.log(`Urgence        : ${finale.urgence}`);
    console.log(
      `Réservation    : ${concernee ? `${concernee.id} (${concernee.description})` : "aucune"}`,
    );
    return;
  }

  console.error(`Pas de réponse finale après ${TOURS_MAX} tours.`);
  process.exit(1);
}

main()
  .catch((erreur) => {
    if (erreur instanceof Anthropic.AuthenticationError) {
      console.error("Clé API refusée : vérifier ANTHROPIC_API_KEY dans .env.");
    } else if (erreur instanceof Anthropic.APIError) {
      console.error(`Erreur de l'API (${erreur.status}) : ${erreur.message}`);
    } else {
      console.error(erreur);
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
