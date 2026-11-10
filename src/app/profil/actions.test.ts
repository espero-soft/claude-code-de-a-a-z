// Les actions de « Mon profil » se protègent seules : appelées directement
// (POST forgé, sans page ni proxy), elles n'agissent que sur le compte
// connecté. La suppression exige un nouveau code e-mail, et jamais celle du
// dernier administrateur.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { empreinteCodeSuppression } from "@/lib/suppression-compte";

const { getSession, prismaSimule, courriel, effacerCompte, fermerPaiementsEnCours, cookiesSupprimes } =
  vi.hoisted(() => ({
    getSession: vi.fn(),
    prismaSimule: {
      user: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
      session: { findUnique: vi.fn(), deleteMany: vi.fn() },
      codeSuppressionCompte: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
      },
    },
    courriel: vi.fn(),
    effacerCompte: vi.fn(),
    fermerPaiementsEnCours: vi.fn(),
    cookiesSupprimes: [] as string[],
  }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ delete: (nom: string) => cookiesSupprimes.push(nom) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirection:${url}`);
  },
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: { getSession },
    $context: Promise.resolve({
      authCookies: {
        sessionToken: { name: "better-auth.session_token" },
        sessionData: { name: "better-auth.session_data" },
        dontRememberToken: { name: "better-auth.dont_remember" },
      },
    }),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaSimule }));
vi.mock("@/lib/courriel", () => ({ envoyerCourriel: courriel }));
vi.mock("@/lib/garde-connexion", () => ({
  consommerLimite: vi.fn(async () => ({ autorise: true })),
}));
vi.mock("@/lib/rattachement", () => ({ rattacherReservationsSansCompte: vi.fn(async () => 0) }));
vi.mock("@/lib/suivi-paiement", () => ({ fermerPaiementsEnCours }));
vi.mock("@/lib/suppression-compte", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/suppression-compte")>()),
  effacerCompte,
}));

import {
  confirmerSuppression,
  deconnecterAppareil,
  deconnecterAutresAppareils,
  demanderCodeSuppression,
  modifierNom,
} from "./actions";

// Connecte `id` dans la session `session-<id>`. Personnel : second facteur
// enrôlé, validé il y a une minute si `deuxiemeFacteur`.
function connecter(id: string | null, role = "CLIENT", deuxiemeFacteur = true) {
  if (id === null) {
    getSession.mockResolvedValue(null);
    return;
  }
  getSession.mockResolvedValue({ user: { id }, session: { id: `session-${id}` } });
  prismaSimule.user.findUnique.mockResolvedValue({
    id,
    email: `${id}@exemple.fr`,
    name: "",
    role,
    twofactors: [{ id: "f1" }],
  });
  prismaSimule.session.findUnique.mockResolvedValue({
    deuxiemeFacteurLe: deuxiemeFacteur ? new Date(Date.now() - 60_000) : null,
  });
}

function formulaire(champs: Record<string, string>) {
  const donnees = new FormData();
  for (const [nom, valeur] of Object.entries(champs)) donnees.set(nom, valeur);
  return donnees;
}

beforeEach(() => {
  vi.clearAllMocks();
  cookiesSupprimes.length = 0;
  prismaSimule.user.count.mockResolvedValue(2);
  prismaSimule.session.deleteMany.mockResolvedValue({ count: 1 });
  prismaSimule.codeSuppressionCompte.updateMany.mockResolvedValue({ count: 1 });
  courriel.mockResolvedValue(undefined);
  fermerPaiementsEnCours.mockResolvedValue(true);
  effacerCompte.mockResolvedValue({ ok: true, email: "x", anonymisees: 0, supprimees: 0, tickets: 0 });
});

describe("modifierNom", () => {
  it("refuse un visiteur sans rien écrire", async () => {
    connecter(null);
    expect((await modifierNom({}, formulaire({ nom: "Pirate" }))).erreur).toBeDefined();
    expect(prismaSimule.user.update).not.toHaveBeenCalled();
  });

  it("n'écrit que le nom, sur le compte connecté, sans rien d'autre du formulaire", async () => {
    connecter("claire");
    const etat = await modifierNom(
      {},
      formulaire({ nom: "  Claire   Dubois ", id: "autre", role: "ADMIN", email: "x@y.fr" }),
    );
    expect(etat.succes).toBe("Votre nom est enregistré.");
    expect(prismaSimule.user.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: "claire" },
      data: { name: "Claire Dubois" },
    });
  });

  it("refuse un nom vide sans écrire", async () => {
    connecter("claire");
    expect(await modifierNom({}, formulaire({ nom: "  " }))).toEqual({
      erreur: "Indiquez votre nom.",
      valeur: "  ",
    });
    expect(prismaSimule.user.update).not.toHaveBeenCalled();
  });
});

describe("deconnecterAppareil", () => {
  it("ne supprime qu'une session du compte connecté", async () => {
    connecter("claire");
    expect(await deconnecterAppareil("session-telephone")).toEqual({
      succes: "L'appareil est déconnecté.",
    });
    expect(prismaSimule.session.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: "session-telephone", userId: "claire" },
    });
  });

  it("répond pour la session d'un autre compte comme pour une session inexistante", async () => {
    connecter("claire");
    // Le filtre userId ne trouve rien : la session de Bob n'est pas touchée.
    prismaSimule.session.deleteMany.mockResolvedValue({ count: 0 });
    const autreCompte = await deconnecterAppareil("session-bob");
    const inexistante = await deconnecterAppareil("session-inconnue");
    expect(autreCompte).toEqual({ erreur: "Cet appareil n'est plus connecté." });
    expect(autreCompte).toEqual(inexistante);
  });

  it("ne déconnecte pas l'appareil de la requête par ce bouton", async () => {
    connecter("claire");
    expect((await deconnecterAppareil("session-claire")).erreur).toBeDefined();
    expect(prismaSimule.session.deleteMany).not.toHaveBeenCalled();
  });

  it("refuse un visiteur", async () => {
    connecter(null);
    expect((await deconnecterAppareil("session-claire")).erreur).toBeDefined();
    expect(prismaSimule.session.deleteMany).not.toHaveBeenCalled();
  });
});

describe("deconnecterAutresAppareils", () => {
  it("supprime toutes les sessions du compte sauf celle-ci", async () => {
    connecter("claire");
    prismaSimule.session.deleteMany.mockResolvedValue({ count: 2 });
    expect(await deconnecterAutresAppareils()).toEqual({ succes: "2 appareils déconnectés." });
    expect(prismaSimule.session.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { userId: "claire", id: { not: "session-claire" } },
    });
  });
});

describe("demanderCodeSuppression", () => {
  it("envoie un nouveau code à l'adresse du compte et n'en garde que l'empreinte", async () => {
    connecter("claire");
    expect(await demanderCodeSuppression()).toEqual({ etape: "code", envoyeA: "claire@exemple.fr" });

    const { a, sujet } = courriel.mock.calls[0][0];
    expect(a).toBe("claire@exemple.fr");
    const code = sujet.match(/(\d{6})$/)[1];
    const { create } = prismaSimule.codeSuppressionCompte.upsert.mock.calls[0][0];
    expect(create).toMatchObject({
      utilisateurId: "claire",
      sessionId: "session-claire",
      empreinte: empreinteCodeSuppression("claire", code),
      essais: 0,
    });
    expect(JSON.stringify(create)).not.toContain(code);
  });

  it("refuse au dernier administrateur, sans envoyer de code", async () => {
    connecter("admin", "ADMIN");
    prismaSimule.user.count.mockResolvedValue(1);
    expect((await demanderCodeSuppression()).erreur).toMatch(/dernier administrateur/);
    expect(courriel).not.toHaveBeenCalled();
  });

  it("refuse au personnel sans second facteur validé", async () => {
    connecter("employe", "EMPLOYE", false);
    expect((await demanderCodeSuppression()).erreur).toMatch(/second facteur/);
    expect(courriel).not.toHaveBeenCalled();
  });
});

describe("confirmerSuppression", () => {
  function codeEnCours(code: string, modif: Record<string, unknown> = {}, id = "claire") {
    prismaSimule.codeSuppressionCompte.findUnique.mockResolvedValue({
      utilisateurId: id,
      sessionId: `session-${id}`,
      empreinte: empreinteCodeSuppression(id, code),
      essais: 0,
      expireLe: new Date(Date.now() + 60_000),
      ...modif,
    });
  }

  it("supprime le compte avec le bon code, retire les cookies et quitte la page", async () => {
    connecter("claire");
    codeEnCours("123456");
    await expect(confirmerSuppression({ etape: "code" }, formulaire({ code: "123 456" }))).rejects.toThrow(
      "redirection:/compte-supprime",
    );
    expect(effacerCompte).toHaveBeenCalledWith(expect.anything(), "claire");
    // Code à usage unique.
    expect(prismaSimule.codeSuppressionCompte.delete).toHaveBeenCalled();
    expect(cookiesSupprimes).toContain("better-auth.session_token");
  });

  it("ne supprime rien avec un mauvais code, et compte l'essai", async () => {
    connecter("claire");
    codeEnCours("123456");
    const etat = await confirmerSuppression({ etape: "code" }, formulaire({ code: "654321" }));
    expect(etat.erreur).toMatch(/Code incorrect/);
    expect(prismaSimule.codeSuppressionCompte.updateMany).toHaveBeenCalledWith({
      where: { utilisateurId: "claire", essais: 0 },
      data: { essais: { increment: 1 } },
    });
    expect(effacerCompte).not.toHaveBeenCalled();
  });

  it("ne croit pas le bon code si l'essai n'a pas pu être compté (essais simultanés)", async () => {
    connecter("claire");
    codeEnCours("123456");
    prismaSimule.codeSuppressionCompte.updateMany.mockResolvedValue({ count: 0 });
    expect((await confirmerSuppression({ etape: "code" }, formulaire({ code: "123456" }))).erreur).toBeDefined();
    expect(effacerCompte).not.toHaveBeenCalled();
  });

  it("refuse le code demandé depuis un autre appareil", async () => {
    connecter("claire");
    codeEnCours("123456", { sessionId: "session-telephone" });
    expect((await confirmerSuppression({ etape: "code" }, formulaire({ code: "123456" }))).erreur).toMatch(
      /Aucun code en cours/,
    );
    expect(effacerCompte).not.toHaveBeenCalled();
  });

  it("refuse sans aucun code demandé", async () => {
    connecter("claire");
    prismaSimule.codeSuppressionCompte.findUnique.mockResolvedValue(null);
    expect((await confirmerSuppression({ etape: "code" }, formulaire({ code: "123456" }))).erreur).toBeDefined();
    expect(effacerCompte).not.toHaveBeenCalled();
  });

  it("ne supprime pas tant qu'un paiement Stripe ne peut pas être fermé", async () => {
    connecter("claire");
    codeEnCours("123456");
    fermerPaiementsEnCours.mockResolvedValue(false);
    expect((await confirmerSuppression({ etape: "code" }, formulaire({ code: "123456" }))).erreur).toMatch(
      /paiement est en cours/,
    );
    expect(effacerCompte).not.toHaveBeenCalled();
  });

  it("refuse au dernier administrateur, même avec le bon code", async () => {
    connecter("admin", "ADMIN");
    prismaSimule.user.count.mockResolvedValue(1);
    codeEnCours("123456", {}, "admin");
    expect((await confirmerSuppression({ etape: "code" }, formulaire({ code: "123456" }))).erreur).toMatch(
      /dernier administrateur/,
    );
    expect(effacerCompte).not.toHaveBeenCalled();
  });

  it("garde le refus de la base si un autre administrateur est parti entre-temps", async () => {
    connecter("admin", "ADMIN");
    codeEnCours("123456", {}, "admin");
    // Contrôle de la page passé (2 administrateurs), mais la transaction,
    // qui recompte, refuse.
    effacerCompte.mockResolvedValue({ ok: false, raison: "dernier-admin" });
    expect((await confirmerSuppression({ etape: "code" }, formulaire({ code: "123456" }))).erreur).toMatch(
      /dernier administrateur/,
    );
    expect(cookiesSupprimes).toEqual([]);
  });

  it("refuse un visiteur sans rien lire", async () => {
    connecter(null);
    expect((await confirmerSuppression({ etape: "code" }, formulaire({ code: "123456" }))).erreur).toBeDefined();
    expect(prismaSimule.codeSuppressionCompte.findUnique).not.toHaveBeenCalled();
  });
});
