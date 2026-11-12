// Tests du hook proteger-push : il bloque tout push forcé, quel que soit
// l'ordre des mots, et laisse passer le push ordinaire (soumis à confirmation
// par la règle « ask ») ainsi que les textes qui citent un push forcé.
// Lancés avec les autres par npm test (Vitest), ou seuls :
// npx vitest run .claude/hooks/proteger-push.test.mjs
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { estInterdite } from "./proteger-push.mjs";

const BLOQUEES = [
  "git push --force",
  "git push -f",
  // Les contournements des règles « deny » par motif :
  "git push origin main --force",
  "git push origin main -f",
  "git push origin --force main",
  "git push -u origin main --force",
  "git push -uf origin main",
  "git push -fu origin main",
  "git push --force-with-lease",
  "git push origin main --force-with-lease=main:abc123",
  "git push origin +main",
  "git push origin +HEAD:refs/heads/main",
  "git push --mirror",
  "git -C /tmp/projet push --force",
  "git -c push.default=current push -f",
  "/usr/bin/git push --force",
  "GIT_TRACE=1 git push --force",
  "npm test && git push origin main --force",
  "bash -c 'git push origin main --force'",
  'eval "git push -f"',
  "echo $(git push --force)",
];

const AUTORISEES = [
  "git push",
  "git push origin main",
  "git push -u origin module-15",
  "git push --tags",
  "git push --follow-tags origin main",
  "git push -o ci.skip origin main",
  "git push --push-option=ci.skip origin main",
  "git status",
  "git pull --rebase",
  "git commit -m 'Interdit git push --force dans le hook'",
  'git commit -m "git push origin main -f est refusé"',
  "echo git push --force",
  "grep -rn 'push --force' .claude",
  "# git push --force",
  "rm -f fichier.txt",
];

describe("estInterdite", () => {
  for (const commande of BLOQUEES) {
    test(`bloque : ${JSON.stringify(commande)}`, () => {
      expect(estInterdite(commande)).toBe(true);
    });
  }
  for (const commande of AUTORISEES) {
    test(`laisse passer : ${JSON.stringify(commande)}`, () => {
      expect(estInterdite(commande)).toBe(false);
    });
  }
});

describe("hook complet (stdin JSON, code de sortie)", () => {
  const script = fileURLToPath(new URL("./proteger-push.mjs", import.meta.url));
  const lancer = (entree) =>
    spawnSync(process.execPath, [script], { input: entree, encoding: "utf8" });

  test("sort en 2 avec l'explication pour un push forcé en fin de commande", () => {
    const resultat = lancer(
      JSON.stringify({ tool_input: { command: "git push origin main --force" } }),
    );
    expect(resultat.status).toBe(2);
    expect(resultat.stderr).toMatch(/push forcé/);
  });

  test("sort en 0 pour un push ordinaire", () => {
    const resultat = lancer(JSON.stringify({ tool_input: { command: "git push origin main" } }));
    expect(resultat.status).toBe(0);
    expect(resultat.stderr).toBe("");
  });

  test("sort en 0 si l'entrée n'est pas du JSON", () => {
    expect(lancer("pas du json").status).toBe(0);
  });
});
