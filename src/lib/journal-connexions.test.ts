// Journal des connexions : écriture, purge à 90 jours et lecture filtrée,
// sur une VRAIE base SQLite temporaire créée par les migrations du projet.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { DUREE_CONSERVATION_MS } from "./journal";
import { journaliser, lireJournal, NOMBRE_MAX_LIGNES, purgerJournal } from "./journal-connexions";

let dossier: string;
let base: PrismaClient;

beforeAll(() => {
  dossier = mkdtempSync(join(tmpdir(), "journal-connexions-"));
  const url = `file:${join(dossier, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
  });
  base = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}, 60_000);

afterAll(async () => {
  await base.$disconnect();
  rmSync(dossier, { recursive: true, force: true });
});

beforeEach(async () => {
  await base.evenementConnexion.deleteMany();
});

const maintenant = new Date("2026-11-10T10:00:00Z");
const ilYa = (ms: number) => new Date(maintenant.getTime() - ms);
const JOUR = 24 * 60 * 60 * 1000;

describe("journaliser", () => {
  it("enregistre l'événement, l'adresse IP et le navigateur", async () => {
    expect(
      await journaliser(
        base,
        {
          type: "CODE_REFUSE",
          email: "Paul@Exemple.fr",
          motif: "code-incorrect",
          ip: "203.0.113.7",
          navigateur: "Mozilla/5.0 (Macintosh) Firefox/140.0",
        },
        maintenant,
      ),
    ).toBe(true);

    const lignes = await base.evenementConnexion.findMany();
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({
      type: "CODE_REFUSE",
      email: "paul@exemple.fr",
      motif: "code-incorrect",
      ip: "203.0.113.7",
      navigateur: "Mozilla/5.0 (Macintosh) Firefox/140.0",
      createdAt: maintenant,
    });
  });

  it("n'écrit dans aucune colonne le code ou le jeton passés par erreur", async () => {
    await journaliser(
      base,
      { type: "CONNEXION_REUSSIE", email: "paul@exemple.fr", otp: "482913", token: "jeton-xyz" } as never,
      maintenant,
    );
    const [ligne] = await base.evenementConnexion.findMany();
    expect(JSON.stringify(ligne)).not.toMatch(/482913|jeton-xyz/);
  });

  it("efface à chaque écriture ce qui a plus de 90 jours, et garde le reste", async () => {
    await base.evenementConnexion.createMany({
      data: [
        { type: "CODE_DEMANDE", email: "vieux@exemple.fr", createdAt: ilYa(DUREE_CONSERVATION_MS + 1) },
        { type: "CODE_DEMANDE", email: "limite@exemple.fr", createdAt: ilYa(DUREE_CONSERVATION_MS) },
        { type: "CODE_DEMANDE", email: "recent@exemple.fr", createdAt: ilYa(89 * JOUR) },
      ],
    });

    await journaliser(base, { type: "CODE_DEMANDE", email: "nouveau@exemple.fr" }, maintenant);

    const restants = (await base.evenementConnexion.findMany({ orderBy: { email: "asc" } })).map(
      (ligne) => ligne.email,
    );
    expect(restants).toEqual(["limite@exemple.fr", "nouveau@exemple.fr", "recent@exemple.fr"]);
  });

  it("n'écrit rien pour un type inconnu", async () => {
    expect(await journaliser(base, { type: "INVENTE" as never }, maintenant)).toBe(false);
    expect(await base.evenementConnexion.count()).toBe(0);
  });

  it("ne fait jamais échouer l'opération journalisée", async () => {
    const enPanne = {
      evenementConnexion: {
        create: vi.fn().mockRejectedValue(new Error("base indisponible")),
        deleteMany: vi.fn(),
      },
    } as never;
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(journaliser(enPanne, { type: "CONNEXION_REUSSIE" }, maintenant)).resolves.toBe(false);
    expect(erreur).toHaveBeenCalled();
    erreur.mockRestore();
  });
});

describe("purgerJournal", () => {
  it("efface les lignes trop anciennes même sans nouvelle écriture", async () => {
    await base.evenementConnexion.createMany({
      data: [
        { type: "CODE_DEMANDE", email: "a@exemple.fr", createdAt: ilYa(91 * JOUR) },
        { type: "CODE_DEMANDE", email: "b@exemple.fr", createdAt: ilYa(400 * JOUR) },
        { type: "CODE_DEMANDE", email: "c@exemple.fr", createdAt: ilYa(JOUR) },
      ],
    });
    expect(await purgerJournal(base, maintenant)).toBe(2);
    expect(await base.evenementConnexion.count()).toBe(1);
  });
});

describe("lireJournal", () => {
  beforeEach(async () => {
    await base.evenementConnexion.createMany({
      data: [
        { type: "CONNEXION_REUSSIE", email: "paul.dupont@exemple.fr", createdAt: ilYa(3 * 60_000) },
        { type: "CODE_REFUSE", email: "paul.dupont@exemple.fr", motif: "code-incorrect", createdAt: ilYa(5 * 60_000) },
        { type: "CODE_DEMANDE", email: "claire@autre.fr", createdAt: ilYa(60_000) },
        { type: "CODE_DEMANDE", email: "paul.dupont@exemple.fr", createdAt: ilYa(100 * JOUR) },
      ],
    });
  });

  it("renvoie les plus récents d'abord, sans les lignes de plus de 90 jours", async () => {
    const lignes = await lireJournal(base, {}, maintenant);
    expect(lignes.map((ligne) => [ligne.type, ligne.email])).toEqual([
      ["CODE_DEMANDE", "claire@autre.fr"],
      ["CONNEXION_REUSSIE", "paul.dupont@exemple.fr"],
      ["CODE_REFUSE", "paul.dupont@exemple.fr"],
    ]);
  });

  it("filtre sur tout ou partie de l'adresse, sans tenir compte de la casse", async () => {
    for (const filtre of ["paul.dupont@exemple.fr", "  DUPONT ", "@exemple.fr"]) {
      const lignes = await lireJournal(base, { email: filtre }, maintenant);
      expect(lignes.map((ligne) => ligne.email)).toEqual([
        "paul.dupont@exemple.fr",
        "paul.dupont@exemple.fr",
      ]);
    }
    expect(await lireJournal(base, { email: "personne" }, maintenant)).toEqual([]);
  });

  it("traite « % » et « _ » comme des caractères, pas comme des jokers", async () => {
    expect(await lireJournal(base, { email: "%" }, maintenant)).toEqual([]);
    expect(await lireJournal(base, { email: "paul_dupont" }, maintenant)).toEqual([]);
    await base.evenementConnexion.create({ data: { type: "CODE_DEMANDE", email: "jean_d@exemple.fr", createdAt: maintenant } });
    expect((await lireJournal(base, { email: "jean_d" }, maintenant)).map((l) => l.email)).toEqual([
      "jean_d@exemple.fr",
    ]);
  });

  it(`n'affiche pas plus de ${NOMBRE_MAX_LIGNES} lignes`, async () => {
    await base.evenementConnexion.createMany({
      data: Array.from({ length: NOMBRE_MAX_LIGNES + 5 }, (_, i) => ({
        type: "CODE_DEMANDE",
        email: "masse@exemple.fr",
        createdAt: ilYa(i * 1000 + 1),
      })),
    });
    expect(await lireJournal(base, {}, maintenant)).toHaveLength(NOMBRE_MAX_LIGNES);
  });

  it("ne renvoie au navigateur ni le compte ni rien d'autre que l'affiché", async () => {
    const [ligne] = await lireJournal(base, {}, maintenant);
    expect(Object.keys(ligne).sort()).toEqual(
      ["createdAt", "email", "id", "ip", "motif", "navigateur", "type"].sort(),
    );
  });
});
