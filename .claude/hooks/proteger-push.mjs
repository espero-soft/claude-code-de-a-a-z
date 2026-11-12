#!/usr/bin/env node
// Hook PreToolUse (Bash) : interdit le push forcé, quel que soit l'ordre des
// mots. Les règles « deny » de .claude/settings.json comparent la commande à un
// motif (« git push --force … ») : `git push origin main --force`, `git push -uf`
// ou `git push origin +main` leur échappaient. Ici la commande est découpée
// comme le ferait le shell (découpage partagé avec proteger-base.mjs) et chaque
// `git push` est examiné option par option.
//
// Refusé : --force, --force-with-lease, -f (seul ou groupé : -uf), --mirror
// (écrase les branches distantes), et une référence précédée de « + »
// (git push origin +main), y compris derrière `git -C dossier`, `bash -c`, eval.
// Sort en code 2 avec l'explication sur stderr : l'outil est bloqué et Claude
// reçoit le message. Le push ordinaire reste soumis à confirmation (« ask »).
//
// Tests : npx vitest run .claude/hooks/proteger-push.test.mjs (inclus dans npm test)

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { decouperCommandes } from "./proteger-base.mjs";

const ENVELOPPES = new Set(["sudo", "env", "command", "exec", "time", "nice", "nohup"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);
const PROFONDEUR_MAX = 5;
// Options globales de git suivies d'une valeur séparée : git -C dossier push.
const OPTIONS_GIT_AVEC_VALEUR = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]);
// Options de git push suivies d'une valeur séparée (la valeur n'est pas une référence).
const OPTIONS_PUSH_AVEC_VALEUR = new Set([
  "-o",
  "--push-option",
  "--repo",
  "--receive-pack",
  "--exec",
]);

const MESSAGE = `Commande refusée : push forcé.
Pourquoi : il réécrit l'historique partagé et peut effacer le travail de l'équipe
sur la branche distante (règle de l'équipe, voir CLAUDE.md, section Sécurité).
À la place :
  - branche distante en avance : git pull --rebase, puis git push (sans forcer) ;
  - si un push forcé est vraiment nécessaire (branche personnelle réécrite),
    explique pourquoi à l'utilisateur et demande-lui de le lancer lui-même.
`;

const nomDe = (mot) => mot.split("/").pop();

function estPushForce(args) {
  let finOptions = false;
  for (let k = 0; k < args.length; k++) {
    const mot = args[k];
    if (!finOptions && mot === "--") {
      finOptions = true;
    } else if (!finOptions && mot.startsWith("--")) {
      const nom = mot.split("=")[0];
      if (nom === "--force" || nom === "--force-with-lease" || nom === "--mirror") return true;
      if (OPTIONS_PUSH_AVEC_VALEUR.has(nom) && !mot.includes("=")) k++;
    } else if (!finOptions && /^-[A-Za-z]+$/.test(mot)) {
      if (mot.includes("f")) return true;
      if (OPTIONS_PUSH_AVEC_VALEUR.has(mot)) k++;
    } else if (mot.startsWith("+")) {
      // Référence forcée : git push origin +main, +HEAD:main.
      return true;
    }
  }
  return false;
}

function estCommandeInterdite(mots, profondeur) {
  let k = 0;
  while (
    k < mots.length &&
    (/^[A-Za-z_][A-Za-z0-9_]*=/.test(mots[k]) ||
      ENVELOPPES.has(nomDe(mots[k])) ||
      mots[k].startsWith("-"))
  ) {
    k++;
  }
  const commande = mots.slice(k);
  if (commande.length === 0) return false;
  const nom = nomDe(commande[0]);
  const args = commande.slice(1);

  if (nom === "git") {
    let s = 0;
    while (s < args.length && args[s].startsWith("-")) {
      s += OPTIONS_GIT_AVEC_VALEUR.has(args[s]) ? 2 : 1;
    }
    return args[s] === "push" && estPushForce(args.slice(s + 1));
  }

  // bash -c '…', sh -lc "…" : le texte passé est lui-même exécuté.
  if (SHELLS.has(nom)) {
    const option = args.findIndex((mot) => /^-[a-z]*c[a-z]*$/.test(mot));
    if (option !== -1 && args[option + 1] !== undefined) {
      return estInterdite(args[option + 1], profondeur + 1);
    }
  }
  if (nom === "eval") return estInterdite(args.join(" "), profondeur + 1);

  return false;
}

export function estInterdite(commande, profondeur = 0) {
  if (profondeur > PROFONDEUR_MAX) return false;
  return decouperCommandes(commande).some((mots) => estCommandeInterdite(mots, profondeur));
}

function lireCommande() {
  try {
    const commande = JSON.parse(readFileSync(0, "utf8"))?.tool_input?.command;
    return typeof commande === "string" ? commande : "";
  } catch {
    return "";
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (estInterdite(lireCommande())) {
    process.stderr.write(MESSAGE);
    process.exit(2);
  }
}
