// Tests du hook proteger-base : il bloque les commandes qui vident la base,
// et laisse passer celles qui ne font que citer ces commandes dans un texte.
// Lancés avec les autres par npm test (Vitest), ou seuls :
// npx vitest run .claude/hooks/proteger-base.test.mjs
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { estDestructrice } from "./proteger-base.mjs";

const BLOQUEES = [
  "npm run db:reset",
  "npm   run\tdb:reset",
  "npm run db:reset && npm run db:seed",
  "cd /tmp/projet && npm run db:reset",
  "npm test; npm run db:reset",
  "npm test\nnpm run db:reset",
  "(npm run db:reset)",
  "FORCE=1 npm run db:reset",
  "sudo npm run db:reset",
  'npm run "db:reset"',
  "pnpm db:reset",
  "yarn db:reset",
  "npx prisma migrate reset",
  "npx prisma migrate reset --force",
  "prisma migrate reset",
  "./node_modules/.bin/prisma migrate reset",
  "pnpm exec prisma migrate reset",
  "npx prisma db push --force-reset",
  "npx prisma db push --accept-data-loss --force-reset",
  "bash -c 'npm run db:reset'",
  'sh -lc "npx prisma migrate reset --force"',
  'eval "npm run db:reset"',
  "echo $(npm run db:reset)",
  'echo "$(npx prisma migrate reset)"',
  "echo `npm run db:reset`",
  // Entre guillemets doubles, les backticks s'exécutent : ce n'est pas un texte.
  'git commit -m "Lance `npm run db:reset`"',
  "npm test # puis\nnpm run db:reset",
];

const AUTORISEES = [
  "npm run db:seed",
  "npm test",
  "npx prisma migrate dev --name ajout-paiement",
  "npx prisma db push",
  "npm run db:reset-test",
  "echo npm run db:reset",
  "grep -n db:reset package.json",
  'grep -rn "prisma migrate reset" .claude',
  "# npm run db:reset",
  'git commit -m "Corrige le hook : npm run db:reset cité dans un message"',
  "git commit -m 'Ne bloque plus prisma migrate reset dans un texte'",
  // Message de commit passé par un heredoc, avec apostrophes.
  `git commit -m "$(cat <<'EOF'
Corrige proteger-base : les faux positifs

npm run db:reset n'est plus bloqué quand il n'est qu'un texte cité.
npx prisma migrate reset --force, idem.
EOF
)"`,
  "git commit -F - <<EOF\nnpm run db:reset\nEOF",
  "cat <<-FIN\n\tnpx prisma migrate reset\n\tFIN",
  // Le faux positif rencontré à l'ouverture de la PR #5 : description passée
  // par un heredoc entre apostrophes, où les backticks restent du texte.
  `gh pr create --base module-07 --title "Atelier 07" --body "$(cat <<'EOF'
Il bloque \`npm run db:reset\` et \`prisma migrate reset\` (code 2).
EOF
)"`,
  'jq -n --arg c "npm run db:reset" \'{tool_input:{command:$c}}\'',
];

describe("estDestructrice", () => {
  for (const commande of BLOQUEES) {
    test(`bloque : ${JSON.stringify(commande)}`, () => {
      expect(estDestructrice(commande)).toBe(true);
    });
  }
  for (const commande of AUTORISEES) {
    test(`laisse passer : ${JSON.stringify(commande)}`, () => {
      expect(estDestructrice(commande)).toBe(false);
    });
  }
});

describe("hook complet (stdin JSON, code de sortie)", () => {
  const script = fileURLToPath(new URL("./proteger-base.mjs", import.meta.url));
  const lancer = (entree) =>
    spawnSync(process.execPath, [script], { input: entree, encoding: "utf8" });

  test("sort en 2 avec l'explication pour une vraie remise à zéro", () => {
    const resultat = lancer(JSON.stringify({ tool_input: { command: "npm run db:reset" } }));
    expect(resultat.status).toBe(2);
    expect(resultat.stderr).toMatch(/Commande refusée/);
  });

  test("sort en 0 pour un commit dont le message cite db:reset", () => {
    const resultat = lancer(
      JSON.stringify({ tool_input: { command: 'git commit -m "npm run db:reset"' } }),
    );
    expect(resultat.status).toBe(0);
    expect(resultat.stderr).toBe("");
  });

  test("sort en 0 si l'entrée n'est pas du JSON", () => {
    expect(lancer("pas du json").status).toBe(0);
  });
});
