// Remise à zéro nocturne de la démonstration, sur une VRAIE base SQLite
// temporaire créée par les migrations du projet : on relit ce qui reste.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { estCompteDeDemonstration, remettreAZeroDemo } from "./remise-a-zero-demo";

describe("estCompteDeDemonstration", () => {
  it("efface les clients, et les comptes sans rôle (traités en clients)", () => {
    expect(estCompteDeDemonstration("CLIENT")).toBe(true);
    expect(estCompteDeDemonstration(null)).toBe(true);
  });

  it.each(["ADMIN", "EMPLOYE", "admin", "", "INCONNU"])("garde un compte de rôle %j", (role) => {
    expect(estCompteDeDemonstration(role)).toBe(false);
  });
});

let dossier: string;
let base: PrismaClient;

beforeAll(() => {
  dossier = mkdtempSync(join(tmpdir(), "remise-a-zero-"));
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

const h = (heure: string) => new Date(`2026-12-01T${heure}:00Z`);
let rang = 0;

async function compte(id: string, email: string, role: string | null) {
  await base.user.create({ data: { id, email, name: `Nom ${id}`, emailVerified: true, role } });
  await base.session.create({ data: { id: `s-${id}`, token: `t-${id}`, userId: id, expiresAt: h("23:00") } });
}

async function reservation(utilisateurId: string | null, statut: "EN_ATTENTE" | "CONFIRMEE" | "ANNULEE") {
  rang += 1;
  await base.reservation.create({
    data: {
      salleId: "horizon",
      utilisateurId,
      debut: h(`${String(8 + (rang % 10)).padStart(2, "0")}:00`),
      fin: h("23:00"),
      nomClient: "Client",
      emailClient: "client@exemple.fr",
      statut,
      montantTotalCentimes: 5000,
      stripeSessionId: statut === "CONFIRMEE" ? `cs_${rang}` : null,
    },
  });
}

beforeEach(async () => {
  for (const table of [
    base.ticket,
    base.reservation,
    base.twoFactor,
    base.session,
    base.user,
    base.verification,
    base.limiteConnexion,
    base.codeSuppressionCompte,
    base.evenementConnexion,
    base.salle,
    base.equipement,
  ] as unknown as { deleteMany: () => Promise<unknown> }[]) {
    await table.deleteMany();
  }
  await base.salle.create({
    data: {
      id: "horizon",
      slug: "horizon",
      nom: "Horizon",
      description: "Salle lumineuse",
      capacite: 8,
      prixHeureCentimes: 4500,
      equipements: { create: [{ nom: "Écran" }] },
    },
  });
});

describe("remettreAZeroDemo (vraie base)", () => {
  it("efface réservations et comptes clients, garde salles, personnel et journal", async () => {
    await compte("admin", "admin@exemple.fr", "ADMIN");
    await compte("employe", "employe@exemple.fr", "EMPLOYE");
    await compte("claire", "claire@exemple.fr", "CLIENT");
    await compte("ancien", "ancien@exemple.fr", null);
    await base.twoFactor.create({ data: { id: "tf", secret: "x", backupCodes: "y", userId: "admin" } });

    await reservation("claire", "CONFIRMEE");
    await reservation("claire", "EN_ATTENTE");
    await reservation(null, "ANNULEE");
    await reservation("admin", "CONFIRMEE"); // essai du personnel : effacé aussi

    await base.ticket.createMany({
      data: [
        { id: "tk-claire", email: " Claire@Exemple.fr", message: "Ma facture", categorie: "paiement", urgence: "basse", resume: "", brouillon: "", aTransmettre: false },
        { id: "tk-autre", email: "inconnu@exemple.fr", message: "Bonjour", categorie: "autre", urgence: "basse", resume: "", brouillon: "", aTransmettre: false },
      ],
    });
    await base.verification.createMany({
      data: [
        { id: "v-claire", identifier: "sign-in-otp-claire@exemple.fr", value: "x", expiresAt: h("23:00") },
        { id: "v-admin", identifier: "sign-in-otp-admin@exemple.fr", value: "x", expiresAt: h("23:00") },
        { id: "v-xclaire", identifier: "sign-in-otp-xclaire@exemple.fr", value: "x", expiresAt: h("23:00") },
      ],
    });
    await base.limiteConnexion.createMany({
      data: [
        { cle: "envoi:claire@exemple.fr", nombre: 1, debut: h("08:00") },
        { cle: "essai:admin@exemple.fr", nombre: 1, debut: h("08:00") },
      ],
    });
    await base.codeSuppressionCompte.create({
      data: { utilisateurId: "claire", sessionId: "s-claire", empreinte: "e", expireLe: h("23:00") },
    });
    await base.evenementConnexion.create({
      data: { type: "connexion-reussie", email: "claire@exemple.fr", utilisateurId: "claire" },
    });

    const bilan = await remettreAZeroDemo(base);

    expect(bilan).toEqual({ reservations: 4, comptes: 2, tickets: 1 });
    expect(await base.reservation.count()).toBe(0);

    // Le personnel reste, avec ses sessions, son second facteur, ses codes.
    expect((await base.user.findMany({ orderBy: { id: "asc" } })).map((u) => [u.id, u.role])).toEqual([
      ["admin", "ADMIN"],
      ["employe", "EMPLOYE"],
    ]);
    expect((await base.session.findMany({ orderBy: { id: "asc" } })).map((s) => s.id)).toEqual([
      "s-admin",
      "s-employe",
    ]);
    expect(await base.twoFactor.count()).toBe(1);
    expect((await base.verification.findMany()).map((v) => v.id).sort()).toEqual(["v-admin", "v-xclaire"]);
    expect((await base.limiteConnexion.findMany()).map((l) => l.cle)).toEqual(["essai:admin@exemple.fr"]);
    expect(await base.codeSuppressionCompte.count()).toBe(0);
    expect((await base.ticket.findMany()).map((t) => t.id)).toEqual(["tk-autre"]);

    // Salles et équipements intacts.
    const salles = await base.salle.findMany({ include: { equipements: true } });
    expect(salles).toHaveLength(1);
    expect(salles[0]).toMatchObject({ slug: "horizon", nom: "Horizon", prixHeureCentimes: 4500, active: true });
    expect(salles[0].equipements.map((e) => e.nom)).toEqual(["Écran"]);

    // Journal des connexions : trace de sécurité, gardée.
    expect(await base.evenementConnexion.count()).toBe(1);
  });

  it("ne fait rien de mal sur une base déjà vide, et se relance sans erreur", async () => {
    await compte("admin", "admin@exemple.fr", "ADMIN");
    expect(await remettreAZeroDemo(base)).toEqual({ reservations: 0, comptes: 0, tickets: 0 });
    expect(await remettreAZeroDemo(base)).toEqual({ reservations: 0, comptes: 0, tickets: 0 });
    expect(await base.user.count()).toBe(1);
    expect(await base.salle.count()).toBe(1);
  });
});
