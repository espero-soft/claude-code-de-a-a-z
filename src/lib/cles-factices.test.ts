// Fausses clés des tests : même préfixe qu'une vraie, et garde-fou sur tout le
// dépôt : aucun fichier suivi par git ne contient une clé écrite d'un seul
// tenant (la protection de push de GitHub la bloquerait, à raison).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleAnthropicFactice, cleStripeFactice } from "./cles-factices";

const RACINE = join(__dirname, "..", "..");

// Formes reconnues par la protection de push : préfixe puis au moins
// 8 caractères (« sk_test_... » ou « sk_test_… » de la documentation passent).
const MOTIFS_CLES = [
  /\b(?:sk|rk|pk)_(?:test|live)_[0-9A-Za-z]{8,}/,
  /\bwhsec_[0-9A-Za-z]{8,}/,
  /\bsk-ant-[a-z0-9]+-[0-9A-Za-z_-]{8,}/,
];

const BINAIRES = /\.(?:png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|otf|db|zip|gz)$/i;

describe("cleStripeFactice", () => {
  it("a le préfixe d'une vraie clé, que le code testé reconnaît", () => {
    expect(cleStripeFactice("sk", "test")).toBe("sk" + "_test_FACTICE");
    expect(cleStripeFactice("rk", "live").startsWith("rk" + "_live_")).toBe(true);
    expect(cleStripeFactice("pk", "test", "FacticeNePasAfficher")).toBe(
      "pk" + "_test_FacticeNePasAfficher",
    );
  });

  it("ne ressemble pas à une vraie clé", () => {
    for (const cle of [cleStripeFactice("sk", "live"), cleAnthropicFactice()]) {
      expect(cle).toContain("FACTICE");
    }
  });
});

describe("dépôt", () => {
  it("aucun fichier suivi ne contient une clé écrite d'un seul tenant", () => {
    const fichiers = execFileSync("git", ["ls-files", "-z"], { cwd: RACINE, encoding: "utf8" })
      .split("\0")
      .filter((fichier) => fichier && !BINAIRES.test(fichier));
    expect(fichiers.length).toBeGreaterThan(50);

    const trouvees: string[] = [];
    for (const fichier of fichiers) {
      let contenu: string;
      try {
        contenu = readFileSync(join(RACINE, fichier), "utf8");
      } catch {
        continue; // supprimé du disque, pas encore de git
      }
      contenu.split("\n").forEach((ligne, rang) => {
        if (MOTIFS_CLES.some((motif) => motif.test(ligne))) trouvees.push(`${fichier}:${rang + 1}`);
      });
    }
    // Remplacer par cleStripeFactice / cleAnthropicFactice (src/lib/cles-factices.ts).
    expect(trouvees).toEqual([]);
  });
});
