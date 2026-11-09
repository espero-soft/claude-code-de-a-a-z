#!/usr/bin/env node
// Hook PreToolUse (Bash) : interdit les commandes qui vident la base de
// développement (npm run db:reset, prisma migrate reset, prisma db push
// --force-reset). dev.db contient les données de l'utilisateur (salles,
// réservations saisies à la main) : les effacer n'est pas réversible.
// Sort en code 2 avec l'explication sur stderr : l'outil est bloqué et Claude
// reçoit le message.
//
// Seules les commandes réellement exécutées comptent, pas un texte qui les
// cite : la commande est découpée comme le ferait le shell (séparateurs,
// guillemets, heredocs) et seul le nom de chaque commande simple est examiné.
// `git commit -m "… npm run db:reset …"` passe donc, `cd x && npm run db:reset`
// est bloqué. Les sous-commandes qui s'exécutent ($(…), `…`, bash -c '…',
// eval) sont analysées elles aussi.
//
// Tests : npx vitest run .claude/hooks/proteger-base.test.mjs (inclus dans npm test)

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SEPARATEURS = new Set([";", "&", "|", "(", ")"]);
// Mots placés devant la vraie commande : sudo npm …, env X=1 npm …
const ENVELOPPES = new Set(["sudo", "env", "command", "exec", "time", "nice", "nohup"]);
const GESTIONNAIRES = new Set(["npm", "pnpm", "yarn", "bun"]);
const LANCEURS = new Set(["npx", "bunx", "pnpm", "yarn", "bun", "npm"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);
const PROFONDEUR_MAX = 5;

const MESSAGE = `Commande refusée : elle vide la base de développement (dev.db).
Pourquoi : la base contient les données de l'utilisateur (réservations, salles modifiées) ;
une réinitialisation les efface définitivement, sans retour arrière possible.
À la place :
  - après une modification du schéma : npx prisma migrate dev --name <changement>
    (applique la migration sans effacer les données) ;
  - pour remettre les 4 salles : npm run db:seed (idempotent, upsert par slug) ;
  - si une remise à zéro est vraiment nécessaire (migration en conflit, base corrompue),
    explique pourquoi à l'utilisateur et demande-lui de lancer lui-même npm run db:reset.
`;

// Découpe une ligne de commande shell en commandes simples, chacune sous forme
// de liste de mots (guillemets retirés). Les corps de heredoc et les
// commentaires sont ignorés ; les sous-commandes $(…) et `…` sont ajoutées
// comme des commandes à part entière.
export function decouperCommandes(source) {
  const commandes = [];
  let i = 0;

  function lireListe(fin) {
    let mots = [];
    let mot = null;
    const heredocs = [];
    const finirMot = () => {
      if (mot !== null) mots.push(mot);
      mot = null;
    };
    const finirCommande = () => {
      finirMot();
      if (mots.length > 0) commandes.push(mots);
      mots = [];
    };
    const ajouter = (texte) => {
      mot = (mot ?? "") + texte;
    };

    while (i < source.length) {
      const c = source[i];
      if (fin && c === fin) {
        i++;
        break;
      }
      if (c === " " || c === "\t") {
        finirMot();
        i++;
      } else if (c === "\n") {
        finirCommande();
        i++;
        for (const heredoc of heredocs.splice(0)) sauterCorps(heredoc);
      } else if (source.startsWith("<<<", i)) {
        // Here-string : le mot suivant est une simple donnée.
        finirMot();
        i += 3;
      } else if (source.startsWith("<<", i)) {
        finirMot();
        i += 2;
        heredocs.push(lireDelimiteur());
      } else if (SEPARATEURS.has(c)) {
        finirCommande();
        i++;
      } else if (c === "#" && mot === null) {
        while (i < source.length && source[i] !== "\n") i++;
      } else if (c === "\\") {
        if (source[i + 1] !== "\n") ajouter(source[i + 1] ?? "");
        i += 2;
      } else if (c === "'") {
        const fermante = source.indexOf("'", i + 1);
        const finTexte = fermante === -1 ? source.length : fermante;
        ajouter(source.slice(i + 1, finTexte));
        i = finTexte + 1;
      } else if (c === '"') {
        i++;
        ajouter(lireGuillemets());
      } else if (c === "$" && source[i + 1] === "(") {
        i += 2;
        ajouter(lireSousCommande(")"));
      } else if (c === "`") {
        i++;
        ajouter(lireSousCommande("`"));
      } else {
        ajouter(c);
        i++;
      }
    }
    finirCommande();
  }

  function lireSousCommande(fin) {
    lireListe(fin);
    return "…";
  }

  function lireGuillemets() {
    let texte = "";
    while (i < source.length && source[i] !== '"') {
      const c = source[i];
      if (c === "\\") {
        texte += source[i + 1] ?? "";
        i += 2;
      } else if (c === "$" && source[i + 1] === "(") {
        i += 2;
        texte += lireSousCommande(")");
      } else if (c === "`") {
        i++;
        texte += lireSousCommande("`");
      } else {
        texte += c;
        i++;
      }
    }
    i++;
    return texte;
  }

  function lireDelimiteur() {
    const retrait = source[i] === "-";
    if (retrait) i++;
    while (source[i] === " " || source[i] === "\t") i++;
    let delimiteur = "";
    while (i < source.length && !/[\s;&|()<>]/.test(source[i])) {
      if (!"'\"\\".includes(source[i])) delimiteur += source[i];
      i++;
    }
    return { delimiteur, retrait };
  }

  function sauterCorps({ delimiteur, retrait }) {
    while (i < source.length) {
      let finLigne = source.indexOf("\n", i);
      if (finLigne === -1) finLigne = source.length;
      let ligne = source.slice(i, finLigne);
      i = finLigne + 1;
      if (retrait) ligne = ligne.replace(/^\t+/, "");
      if (ligne === delimiteur) return;
    }
  }

  lireListe(null);
  return commandes;
}

const nomDe = (mot) => mot.split("/").pop();
const estPrisma = (mot) => /^prisma(@.*)?$/.test(nomDe(mot));

function estCommandeDestructrice(mots, profondeur) {
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

  // npm run db:reset, pnpm db:reset, yarn db:reset…
  if (GESTIONNAIRES.has(nom) && args.includes("db:reset")) return true;

  // prisma …, npx prisma …, pnpm exec prisma …
  const p = estPrisma(commande[0])
    ? 0
    : LANCEURS.has(nom)
      ? commande.findIndex((mot, index) => index > 0 && estPrisma(mot))
      : -1;
  if (p !== -1) {
    const positionnels = commande.slice(p + 1).filter((mot) => !mot.startsWith("-"));
    if (positionnels[0] === "migrate" && positionnels[1] === "reset") return true;
    if (
      positionnels[0] === "db" &&
      positionnels[1] === "push" &&
      commande.includes("--force-reset")
    ) {
      return true;
    }
  }

  // bash -c '…', sh -lc "…" : le texte passé est lui-même exécuté.
  if (SHELLS.has(nom)) {
    const option = args.findIndex((mot) => /^-[a-z]*c[a-z]*$/.test(mot));
    if (option !== -1 && args[option + 1] !== undefined) {
      return estDestructrice(args[option + 1], profondeur + 1);
    }
  }
  if (nom === "eval") return estDestructrice(args.join(" "), profondeur + 1);

  return false;
}

export function estDestructrice(commande, profondeur = 0) {
  if (profondeur > PROFONDEUR_MAX) return false;
  return decouperCommandes(commande).some((mots) =>
    estCommandeDestructrice(mots, profondeur),
  );
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
  if (estDestructrice(lireCommande())) {
    process.stderr.write(MESSAGE);
    process.exit(2);
  }
}
