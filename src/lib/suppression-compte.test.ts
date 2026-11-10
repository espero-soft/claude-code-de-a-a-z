// Suppression d'un compte (RGPD) : décisions pures, puis l'effacement lui-même
// sur une VRAIE base SQLite temporaire, créée par les migrations du projet.
// Une base simulée prouverait seulement que l'on appelle les bonnes
// méthodes ; ici, on relit ce qui reste réellement en base.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { reservationsARattacher } from "./rattachement";
import {
  EMAIL_ANONYME,
  effacerCompte,
  empreinteCodeSuppression,
  ESSAIS_CODE_SUPPRESSION,
  genererCodeSuppression,
  NOM_ANONYME,
  refusSuppression,
  sortReservation,
  verifierCodeSuppression,
  type CodeEnregistre,
} from "./suppression-compte";

// rattachement.ts importe le client de l'application (dev.db) : jamais
// utilisé ici, seule sa décision pure reservationsARattacher l'est.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const maintenant = new Date("2026-11-10T10:00:00Z");

describe("code de confirmation de la suppression", () => {
  const ligne = (modif: Partial<CodeEnregistre> = {}): CodeEnregistre => ({
    utilisateurId: "u1",
    sessionId: "s1",
    empreinte: empreinteCodeSuppression("u1", "123456"),
    essais: 0,
    expireLe: new Date(maintenant.getTime() + 60_000),
    ...modif,
  });
  const demande = { utilisateurId: "u1", sessionId: "s1", code: "123456" };

  it("génère 6 chiffres, zéros en tête compris", () => {
    for (let i = 0; i < 200; i++) expect(genererCodeSuppression()).toMatch(/^\d{6}$/);
  });

  it("n'enregistre jamais le code en clair", () => {
    const empreinte = empreinteCodeSuppression("u1", "123456");
    expect(empreinte).not.toContain("123456");
    expect(empreinte).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepte le bon code, dans la session qui l'a demandé, à temps", () => {
    expect(verifierCodeSuppression(ligne(), demande, maintenant)).toEqual({ ok: true });
  });

  it("refuse un mauvais code", () => {
    expect(verifierCodeSuppression(ligne(), { ...demande, code: "654321" }, maintenant)).toEqual({
      ok: false,
      raison: "incorrect",
    });
  });

  it("refuse sans code demandé", () => {
    expect(verifierCodeSuppression(null, demande, maintenant)).toEqual({ ok: false, raison: "absent" });
  });

  it("refuse le code depuis une autre session du même compte", () => {
    expect(verifierCodeSuppression(ligne({ sessionId: "s2" }), demande, maintenant)).toEqual({
      ok: false,
      raison: "absent",
    });
  });

  it("refuse le code d'un autre compte", () => {
    const autre = { ...demande, utilisateurId: "u2" };
    expect(verifierCodeSuppression(ligne(), autre, maintenant).ok).toBe(false);
  });

  it("refuse un code expiré, même juste", () => {
    expect(verifierCodeSuppression(ligne({ expireLe: maintenant }), demande, maintenant)).toEqual({
      ok: false,
      raison: "expire",
    });
  });

  it(`refuse même le bon code après ${ESSAIS_CODE_SUPPRESSION} essais`, () => {
    const epuise = ligne({ essais: ESSAIS_CODE_SUPPRESSION });
    expect(verifierCodeSuppression(epuise, demande, maintenant)).toEqual({
      ok: false,
      raison: "trop-d-essais",
    });
  });
});

describe("refusSuppression", () => {
  it("refuse au dernier administrateur", () => {
    expect(refusSuppression({ roleCompte: "ADMIN", deuxiemeFacteur: "valide" }, 1)).toBe(
      "dernier-admin",
    );
  });

  it("refuse au dernier administrateur même sans second facteur validé (rôle enregistré)", () => {
    expect(refusSuppression({ roleCompte: "ADMIN", deuxiemeFacteur: "a-verifier" }, 1)).toBe(
      "dernier-admin",
    );
  });

  it("laisse partir un administrateur s'il en reste un autre", () => {
    expect(refusSuppression({ roleCompte: "ADMIN", deuxiemeFacteur: "valide" }, 2)).toBeNull();
  });

  it.each(["EMPLOYE", "ADMIN"] as const)("exige le second facteur du rôle %s", (roleCompte) => {
    expect(refusSuppression({ roleCompte, deuxiemeFacteur: "a-verifier" }, 2)).toBe(
      "deuxieme-facteur",
    );
  });

  it("laisse un client supprimer son compte", () => {
    expect(refusSuppression({ roleCompte: "CLIENT", deuxiemeFacteur: "inutile" }, 1)).toBeNull();
  });
});

describe("sortReservation", () => {
  it("garde (anonymisée) une réservation payée", () => {
    expect(sortReservation({ statut: "CONFIRMEE", stripeSessionId: "cs_1" })).toBe("anonymiser");
  });

  it("garde une réservation passée par Stripe puis annulée (remboursement possible)", () => {
    expect(sortReservation({ statut: "ANNULEE", stripeSessionId: "cs_1" })).toBe("anonymiser");
  });

  it.each(["EN_ATTENTE", "ANNULEE"])("supprime une réservation %s jamais envoyée au paiement", (statut) => {
    expect(sortReservation({ statut, stripeSessionId: null })).toBe("supprimer");
  });
});

// --- Sur une vraie base ---

let dossier: string;
let base: PrismaClient;

// Base créée comme en production : `prisma migrate deploy` applique les
// migrations du projet (dotenv ne remplace pas une variable déjà définie).
beforeAll(() => {
  dossier = mkdtempSync(join(tmpdir(), "suppression-compte-"));
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

async function creerCompte(id: string, email: string, role = "CLIENT") {
  await base.user.create({ data: { id, email, name: `Nom ${id}`, emailVerified: true, role } });
}

async function creerReservation(
  utilisateurId: string | null,
  email: string,
  statut: "EN_ATTENTE" | "CONFIRMEE" | "ANNULEE",
  stripeSessionId: string | null,
  heure = "09:00",
) {
  const { id } = await base.reservation.create({
    data: {
      salleId: "salle",
      utilisateurId,
      debut: h(heure),
      fin: h("23:00"),
      nomClient: "Claire Dubois",
      emailClient: email,
      statut,
      stripeSessionId,
      montantTotalCentimes: 5000,
    },
  });
  return id;
}

beforeEach(async () => {
  await base.ticket.deleteMany();
  await base.reservation.deleteMany();
  await base.session.deleteMany();
  await base.user.deleteMany();
  await base.verification.deleteMany();
  await base.limiteConnexion.deleteMany();
  await base.codeSuppressionCompte.deleteMany();
  await base.salle.upsert({
    where: { id: "salle" },
    create: { id: "salle", slug: "s", nom: "Salle", description: "", capacite: 4, prixHeureCentimes: 2500 },
    update: {},
  });
});

describe("effacerCompte (vraie base)", () => {
  it("efface les données personnelles et garde, anonymisées, les réservations payées", async () => {
    await creerCompte("claire", "claire@exemple.fr");
    await creerCompte("autre", "autre@exemple.fr");
    await base.session.createMany({
      data: [
        { id: "s1", token: "t1", userId: "claire", expiresAt: h("23:00") },
        { id: "s2", token: "t2", userId: "claire", expiresAt: h("23:00") },
        { id: "s3", token: "t3", userId: "autre", expiresAt: h("23:00") },
      ],
    });
    await base.twoFactor.create({ data: { id: "tf", secret: "x", backupCodes: "y", userId: "claire" } });
    const payee = await creerReservation("claire", "claire@exemple.fr", "CONFIRMEE", "cs_paye", "08:00");
    const rembourse = await creerReservation("claire", "claire@exemple.fr", "ANNULEE", "cs_rembourse", "09:00");
    const attenteStripe = await creerReservation("claire", "claire@exemple.fr", "EN_ATTENTE", "cs_ferme", "10:00");
    const jamaisPayee = await creerReservation("claire", "claire@exemple.fr", "EN_ATTENTE", null, "11:00");
    const annulee = await creerReservation("claire", "claire@exemple.fr", "ANNULEE", null, "12:00");
    const autre = await creerReservation("autre", "autre@exemple.fr", "CONFIRMEE", "cs_autre", "13:00");
    await base.ticket.createMany({
      data: [
        { id: "tk1", email: "Claire@Exemple.fr ", message: "Ma facture", categorie: "paiement", urgence: "basse", resume: "", brouillon: "", aTransmettre: false },
        { id: "tk2", email: "autre@exemple.fr", message: "Bonjour", categorie: "autre", urgence: "basse", resume: "", brouillon: "", aTransmettre: false },
      ],
    });
    await base.verification.createMany({
      data: [
        { id: "v1", identifier: "sign-in-otp-claire@exemple.fr", value: "x", expiresAt: h("23:00") },
        { id: "v2", identifier: "sign-in-otp-autre@exemple.fr", value: "x", expiresAt: h("23:00") },
        // Adresse qui finit comme celle de Claire : pas la sienne.
        { id: "v3", identifier: "sign-in-otp-xclaire@exemple.fr", value: "x", expiresAt: h("23:00") },
      ],
    });
    await base.limiteConnexion.createMany({
      data: [
        { cle: "envoi:claire@exemple.fr", nombre: 1, debut: h("08:00") },
        { cle: "envoi:autre@exemple.fr", nombre: 1, debut: h("08:00") },
      ],
    });
    await base.codeSuppressionCompte.create({
      data: { utilisateurId: "claire", sessionId: "s1", empreinte: "e", expireLe: h("23:00") },
    });

    const resultat = await effacerCompte(base, "claire");

    expect(resultat).toEqual({
      ok: true,
      email: "claire@exemple.fr",
      anonymisees: 3,
      supprimees: 2,
      tickets: 1,
    });

    // Le compte, ses sessions (tous ses appareils) et son second facteur.
    expect(await base.user.findUnique({ where: { id: "claire" } })).toBeNull();
    expect(await base.session.findMany({ where: { userId: "claire" } })).toEqual([]);
    expect(await base.twoFactor.count()).toBe(0);
    expect(await base.codeSuppressionCompte.count()).toBe(0);

    // Réservations payées ou passées par Stripe : gardées, sans rien de personnel.
    const gardees = await base.reservation.findMany({
      where: { id: { in: [payee, rembourse, attenteStripe] } },
      orderBy: { debut: "asc" },
    });
    expect(gardees).toHaveLength(3);
    for (const r of gardees) {
      expect(r).toMatchObject({ nomClient: NOM_ANONYME, emailClient: EMAIL_ANONYME, utilisateurId: null });
      expect(JSON.stringify(r)).not.toMatch(/claire/i);
    }
    // Ce qu'il faut à la comptabilité reste intact.
    expect(gardees.map((r) => [r.statut, r.stripeSessionId, r.montantTotalCentimes])).toEqual([
      ["CONFIRMEE", "cs_paye", 5000],
      ["ANNULEE", "cs_rembourse", 5000],
      // Paiement fermé avant l'effacement : la réservation en attente est annulée.
      ["ANNULEE", "cs_ferme", 5000],
    ]);
    // Jamais payées : supprimées.
    expect(await base.reservation.count({ where: { id: { in: [jamaisPayee, annulee] } } })).toBe(0);

    // Tickets, codes et compteurs : ceux de Claire seulement.
    expect((await base.ticket.findMany()).map((t) => t.id)).toEqual(["tk2"]);
    expect((await base.verification.findMany()).map((v) => v.id).sort()).toEqual(["v2", "v3"]);
    expect((await base.limiteConnexion.findMany()).map((l) => l.cle)).toEqual(["envoi:autre@exemple.fr"]);

    // L'autre compte n'est pas touché.
    expect(await base.user.findUnique({ where: { id: "autre" } })).not.toBeNull();
    expect(await base.session.count({ where: { userId: "autre" } })).toBe(1);
    expect(await base.reservation.findUnique({ where: { id: autre } })).toMatchObject({
      nomClient: "Claire Dubois",
      emailClient: "autre@exemple.fr",
      utilisateurId: "autre",
    });
  });

  it("une réservation anonymisée n'est jamais rattachée à un nouveau compte à la même adresse", async () => {
    await creerCompte("claire", "claire@exemple.fr");
    await creerReservation("claire", "claire@exemple.fr", "CONFIRMEE", "cs_paye");
    await effacerCompte(base, "claire");

    // Claire rouvre un compte avec la même adresse.
    await creerCompte("claire-2", "claire@exemple.fr");
    const candidates = await base.reservation.findMany({
      where: { utilisateurId: null },
      select: { id: true, emailClient: true, utilisateurId: true },
    });
    expect(candidates).toHaveLength(1);
    expect(
      reservationsARattacher({ id: "claire-2", email: "claire@exemple.fr", emailVerified: true }, candidates),
    ).toEqual([]);
  });

  it("refuse de supprimer le dernier administrateur, sans rien effacer", async () => {
    await creerCompte("admin", "admin@exemple.fr", "ADMIN");
    await creerCompte("employe", "employe@exemple.fr", "EMPLOYE");
    await creerReservation("admin", "admin@exemple.fr", "EN_ATTENTE", null);

    expect(await effacerCompte(base, "admin")).toEqual({ ok: false, raison: "dernier-admin" });
    expect(await base.user.findUnique({ where: { id: "admin" } })).not.toBeNull();
    expect(await base.reservation.count({ where: { utilisateurId: "admin" } })).toBe(1);
  });

  it("supprime un administrateur s'il en reste un autre", async () => {
    await creerCompte("admin-1", "admin-1@exemple.fr", "ADMIN");
    await creerCompte("admin-2", "admin-2@exemple.fr", "ADMIN");

    expect((await effacerCompte(base, "admin-1")).ok).toBe(true);
    // Le second est désormais le dernier : il ne peut plus partir.
    expect(await effacerCompte(base, "admin-2")).toEqual({ ok: false, raison: "dernier-admin" });
    expect(await base.user.count({ where: { role: "ADMIN" } })).toBe(1);
  });

  it("deux administrateurs qui partent en même temps : un seul y parvient", async () => {
    await creerCompte("admin-1", "admin-1@exemple.fr", "ADMIN");
    await creerCompte("admin-2", "admin-2@exemple.fr", "ADMIN");

    const resultats = await Promise.all([effacerCompte(base, "admin-1"), effacerCompte(base, "admin-2")]);

    expect(resultats.filter((r) => r.ok)).toHaveLength(1);
    expect(await base.user.count({ where: { role: "ADMIN" } })).toBe(1);
  });

  it("répond introuvable pour un compte qui n'existe plus", async () => {
    expect(await effacerCompte(base, "fantome")).toEqual({ ok: false, raison: "introuvable" });
  });
});
