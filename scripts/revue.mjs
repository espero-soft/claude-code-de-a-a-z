// Revue automatique du diff de la branche courante par rapport à module-08 :
// envoie le diff à `claude -p` pour vérifier les règles métier R1 à R6
// et écrit le rapport (en français) dans revue.md (ignoré par git).
//
// Pour un résultat identique dans toute l'équipe :
// - seuls les réglages du projet sont chargés (--setting-sources project) ;
// - seuls les outils de lecture sont disponibles (Read, Grep, Glob) ;
// - aucun serveur MCP n'est chargé (--strict-mcp-config sans --mcp-config).
import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const BASE = "module-08";
const FICHIER_RAPPORT = "revue.md";

const OPTIONS_GIT = { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 };

// Diff de l'arbre de travail (commits de la branche + modifications non commitées)
// par rapport à module-08.
let diff = execFileSync("git", ["diff", BASE, "--", "."], OPTIONS_GIT);

// `git diff` ignore les fichiers non suivis : on les ajoute comme fichiers créés,
// sans modifier l'index (git diff --no-index renvoie le code 1 s'il y a une différence).
const nonSuivis = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], OPTIONS_GIT)
  .split("\n")
  .filter(Boolean);
for (const fichier of nonSuivis) {
  const r = spawnSync("git", ["diff", "--no-index", "--", "/dev/null", fichier], OPTIONS_GIT);
  diff += r.stdout;
}

if (!diff.trim()) {
  const message = `# Revue des règles R1 à R6\n\nAucune différence par rapport à \`${BASE}\` : rien à relire.\n`;
  writeFileSync(FICHIER_RAPPORT, message);
  console.log(`Aucun changement par rapport à ${BASE}. Rapport écrit dans ${FICHIER_RAPPORT}.`);
  process.exit(0);
}

const consigne = `Tu relis un changement du projet (diff par rapport à la branche ${BASE}, fourni sur l'entrée standard).
Vérifie qu'il respecte les règles métier R1 à R6 du cahier des charges (tableau « Règles métier » de CLAUDE.md)
et les conventions de CLAUDE.md (heures Europe/Paris, montants en centimes, prix lu en base, logique pure dans src/lib/ testée à côté).
Tu peux lire les fichiers du projet (Read, Grep, Glob) pour le contexte ; ne modifie rien.

Rédige le rapport en français, en Markdown, et réponds uniquement par ce rapport :
# Revue des règles R1 à R6
## Résumé
(une ou deux phrases : le changement respecte-t-il les règles ?)
## Règles
Un tableau | Règle | Concernée par le diff ? | Verdict (Respectée / Non respectée / Non concernée) | Détail |, une ligne par règle R1 à R6.
## Problèmes
Liste des problèmes avec fichier:ligne, la règle en cause et une correction proposée ; « Aucun » s'il n'y en a pas.
## Tests
Les tests Vitest couvrent-ils les règles touchées ? Cas manquants éventuels.`;

const resultat = spawnSync(
  "claude",
  [
    "-p",
    consigne,
    "--setting-sources",
    "project",
    "--tools",
    "Read,Grep,Glob",
    "--strict-mcp-config",
    "--output-format",
    "text",
    "--no-session-persistence",
  ],
  { input: diff, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["pipe", "pipe", "inherit"] },
);

if (resultat.error || resultat.status !== 0) {
  console.error(`Échec de claude -p (code ${resultat.status ?? "?"}) ${resultat.error?.message ?? ""}`);
  process.exit(1);
}

writeFileSync(FICHIER_RAPPORT, resultat.stdout.trimEnd() + "\n");
console.log(`Rapport écrit dans ${FICHIER_RAPPORT}.`);
