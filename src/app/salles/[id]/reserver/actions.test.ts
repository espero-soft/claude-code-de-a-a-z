// La Server Action reserver se protège seule : appelée directement (POST
// forgé, sans page ni proxy), elle exige un compte et rattache la réservation
// à ce compte (son titulaire).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, prismaSimule } = vi.hoisted(() => ({
  getSession: vi.fn(),
  prismaSimule: {
    user: { findUnique: vi.fn() },
    salle: { findFirst: vi.fn() },
    reservation: { create: vi.fn() },
  },
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirection:${url}`);
  },
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaSimule }));
vi.mock("@/lib/conflit-confirme", () => ({ trouverConflitConfirme: async () => null }));

import { reserver, type EtatFormulaire } from "./actions";

// Mardi 10 novembre 2026, 11 h à Paris ; on réserve le lundi suivant.
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-10T10:00:00Z"));
  prismaSimule.salle.findFirst.mockResolvedValue({ id: "s1", prixHeureCentimes: 4000 });
  prismaSimule.reservation.create.mockResolvedValue({ id: "r1" });
});
afterEach(() => {
  vi.useRealTimers();
});

const etatInitial: EtatFormulaire = {
  erreurs: {},
  valeurs: { date: "", heureDebut: "", heureFin: "", nomClient: "", emailClient: "" },
};

function saisie() {
  const donnees = new FormData();
  donnees.set("date", "2026-11-16");
  donnees.set("heureDebut", "10:00");
  donnees.set("heureFin", "11:00");
  donnees.set("nomClient", "Claire Martin");
  donnees.set("emailClient", "claire@exemple.fr");
  return donnees;
}

describe("reserver", () => {
  it("refuse un visiteur sans rien créer, en gardant sa saisie", async () => {
    getSession.mockResolvedValue(null);
    const etat = await reserver("s1", etatInitial, saisie());
    expect(etat.erreurs).toEqual({ general: "Connectez-vous pour réserver une salle." });
    expect(etat.valeurs.nomClient).toBe("Claire Martin");
    expect(prismaSimule.reservation.create).not.toHaveBeenCalled();
  });

  it("rattache la réservation au compte connecté", async () => {
    getSession.mockResolvedValue({ user: { id: "claire" } });
    prismaSimule.user.findUnique.mockResolvedValue({
      id: "claire",
      email: "claire@exemple.fr",
      name: "",
      role: "CLIENT",
    });

    await expect(reserver("s1", etatInitial, saisie())).rejects.toThrow("redirection:/reservations/r1");
    expect(prismaSimule.reservation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ utilisateurId: "claire", statut: "EN_ATTENTE" }),
      }),
    );
  });
});
