// Cache de prompt : deux appels identiques avec la consigne du support marquée
// pour le cache (cache_control). Le premier écrit la consigne en cache, le second
// la relit. Pour chaque appel, on affiche les jetons (entrée normale, écrits en
// cache, lus depuis le cache, sortie) et le coût, puis on compare au coût des
// deux mêmes appels sans cache.
//
// Usage : npm run cache-prompt
// La clé est lue dans .env (ANTHROPIC_API_KEY).
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { CONSIGNE_SUPPORT } from "../src/lib/consigne-support";

const MODELE = "claude-haiku-5-5";

// Prix en dollars par million de jetons.
const PRIX_ENTREE = 0.1;
const PRIX_ECRITURE_CACHE = PRIX_ENTREE * 1.25;
const PRIX_LECTURE_CACHE = PRIX_ENTREE * 0.1;
const PRIX_SORTIE = 0.5;

const MESSAGE_CLIENTE =
  "Bonjour, j'ai réservé l'Agora pour le mardi 24 novembre à 14 h, mais notre réunion est reportée. " +
  "Je dois annuler : pouvez-vous me rembourser ?\n\n" +
  "Camille Martin\ncamille@example.com";

type Bilan = {
  entree: number;
  ecritureCache: number;
  lectureCache: number;
  sortie: number;
  coutAvecCache: number;
  coutSansCache: number;
};

function bilan(usage: Anthropic.Usage): Bilan {
  const entree = usage.input_tokens;
  const ecritureCache = usage.cache_creation_input_tokens ?? 0;
  const lectureCache = usage.cache_read_input_tokens ?? 0;
  const sortie = usage.output_tokens;
  const coutAvecCache =
    (entree * PRIX_ENTREE +
      ecritureCache * PRIX_ECRITURE_CACHE +
      lectureCache * PRIX_LECTURE_CACHE +
      sortie * PRIX_SORTIE) /
    1_000_000;
  // Sans cache, tous les jetons d'entrée sont facturés au prix normal.
  const coutSansCache =
    ((entree + ecritureCache + lectureCache) * PRIX_ENTREE + sortie * PRIX_SORTIE) /
    1_000_000;
  return { entree, ecritureCache, lectureCache, sortie, coutAvecCache, coutSansCache };
}

const dollars = (montant: number) => `${montant.toFixed(6)} $`;

async function appeler(client: Anthropic, numero: number): Promise<Bilan> {
  const reponse = await client.messages.create({
    model: MODELE,
    max_tokens: 2048,
    output_config: { effort: "low" },
    // Préfixe figé, marqué pour le cache : tout ce qui précède le marqueur
    // (ici, la consigne système) est écrit puis relu en cache.
    system: [
      { type: "text", text: CONSIGNE_SUPPORT, cache_control: { type: "ephemeral" } },
    ],
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
  const b = bilan(reponse.usage);

  console.log(`=== Appel ${numero} ===`);
  console.log(texte);
  console.log("");
  console.log(`Jetons entrée normale  : ${b.entree}`);
  console.log(`Jetons écrits en cache : ${b.ecritureCache}`);
  console.log(`Jetons lus du cache    : ${b.lectureCache}`);
  console.log(`Jetons sortie          : ${b.sortie}`);
  console.log(`Coût (avec cache)      : ${dollars(b.coutAvecCache)}`);
  console.log("");
  return b;
}

async function main() {
  const client = new Anthropic(); // lit ANTHROPIC_API_KEY dans l'environnement

  // Les appels sont faits l'un après l'autre : le second doit trouver le cache écrit.
  const premier = await appeler(client, 1);
  const second = await appeler(client, 2);

  if (premier.ecritureCache + premier.lectureCache === 0) {
    console.warn(
      "Attention : rien n'a été mis en cache (consigne sous le minimum de jetons ?).",
    );
  }

  const totalAvec = premier.coutAvecCache + second.coutAvecCache;
  const totalSans = premier.coutSansCache + second.coutSansCache;
  console.log("=== Comparaison sur les deux appels ===");
  console.log(`Coût avec cache        : ${dollars(totalAvec)}`);
  console.log(`Coût sans cache        : ${dollars(totalSans)}`);
  console.log(
    `Économie               : ${dollars(totalSans - totalAvec)} (${(((totalSans - totalAvec) / totalSans) * 100).toFixed(1)} %)`,
  );
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
