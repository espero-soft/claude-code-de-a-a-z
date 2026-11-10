// Premier appel à l'API Claude : classe le message d'une cliente dans une catégorie
// (réservation, paiement, annulation ou autre), puis affiche la réponse, le modèle,
// les jetons consommés et le coût en dollars.
//
// Usage : npm run premier-appel [-- <modèle>]
//   ex. : npm run premier-appel -- claude-sonnet-5-5
// La clé est lue dans .env (ANTHROPIC_API_KEY).
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

// Prix en dollars par million de jetons (entrée, sortie).
const TARIFS = {
  "claude-haiku-5-5": { entree: 0.1, sortie: 0.5 },
  "claude-sonnet-5-5": { entree: 2, sortie: 10 },
  "claude-opus-5-5": { entree: 4, sortie: 20 },
} as const;

type Modele = keyof typeof TARIFS;
const MODELE_PAR_DEFAUT: Modele = "claude-haiku-5-5";

const CONSIGNE =
  "Tu tries les messages des clients d'un centre d'affaires qui loue des salles de réunion. " +
  "Réponds en un seul mot, en minuscules, par la catégorie du message : " +
  "réservation, paiement, annulation ou autre.";

const MESSAGE_CLIENTE =
  "Bonjour, j'ai réservé l'Agora pour le mardi 24 novembre à 14 h, mais notre réunion est reportée. " +
  "Je dois annuler : pouvez-vous me rembourser ?";

function lireModele(): Modele {
  const argument = process.argv[2] ?? MODELE_PAR_DEFAUT;
  if (!(argument in TARIFS)) {
    console.error(`Modèle inconnu : ${argument}. Choix possibles : ${Object.keys(TARIFS).join(", ")}`);
    process.exit(1);
  }
  return argument as Modele;
}

async function main() {
  const modele = lireModele();
  const client = new Anthropic(); // lit ANTHROPIC_API_KEY dans l'environnement

  const reponse = await client.messages.create({
    model: modele,
    max_tokens: 1024,
    output_config: { effort: "low" }, // tâche simple : peu de réflexion
    system: CONSIGNE,
    messages: [{ role: "user", content: MESSAGE_CLIENTE }],
  });

  if (reponse.stop_reason === "refusal") {
    console.error("Le modèle a refusé de répondre.", reponse.stop_details ?? "");
    process.exit(1);
  }

  const texte = reponse.content
    .filter((bloc) => bloc.type === "text")
    .map((bloc) => bloc.text)
    .join("")
    .trim();

  const { input_tokens: jetonsEntree, output_tokens: jetonsSortie } = reponse.usage;
  const tarif = TARIFS[modele];
  const cout = (jetonsEntree * tarif.entree + jetonsSortie * tarif.sortie) / 1_000_000;

  console.log(`Réponse        : ${texte}`);
  console.log(`Modèle         : ${reponse.model}`);
  console.log(`Jetons entrée  : ${jetonsEntree}`);
  console.log(`Jetons sortie  : ${jetonsSortie}`);
  console.log(`Coût           : ${cout.toFixed(6)} $`);
}

main().catch((erreur) => {
  if (erreur instanceof Anthropic.AuthenticationError) {
    console.error("Clé API refusée : vérifier ANTHROPIC_API_KEY dans .env.");
  } else if (erreur instanceof Anthropic.APIError) {
    console.error(`Erreur de l'API (${erreur.status}) : ${erreur.message}`);
  } else {
    console.error(erreur);
  }
  process.exit(1);
});
