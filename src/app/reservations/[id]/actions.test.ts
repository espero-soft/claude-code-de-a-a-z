// La Server Action payer se protège seule : appelée directement (POST forgé,
// sans page ni proxy), elle n'ouvre un paiement que pour le titulaire, et
// répond aux autres exactement comme pour une réservation inexistante.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, prismaSimule, ouvrirPaiement } = vi.hoisted(() => ({
  getSession: vi.fn(),
  prismaSimule: {
    user: { findUnique: vi.fn() },
    reservation: { findUnique: vi.fn() },
  },
  ouvrirPaiement: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "http://localhost:3000" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirection:${url}`);
  },
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaSimule }));
vi.mock("@/lib/suivi-paiement", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/suivi-paiement")>()),
  ouvrirPaiement,
}));

import { payer } from "./actions";

function connecter(id: string | null, role = "CLIENT") {
  if (id === null) {
    getSession.mockResolvedValue(null);
    return;
  }
  getSession.mockResolvedValue({ user: { id } });
  prismaSimule.user.findUnique.mockResolvedValue({ id, email: `${id}@exemple.fr`, name: "", role });
}

// En base : « r-titulaire » appartient au compte « titulaire » ; tout autre
// identifiant n'existe pas.
beforeEach(() => {
  vi.clearAllMocks();
  prismaSimule.reservation.findUnique.mockImplementation(async ({ where }) =>
    where.id === "r-titulaire" ? { utilisateurId: "titulaire" } : null,
  );
  ouvrirPaiement.mockResolvedValue({ ok: true, url: "https://checkout.stripe.test/s" });
});

const INEXISTANTE = { erreur: "Cette réservation n'existe pas." };

describe("payer", () => {
  it("refuse un visiteur sans rien lire ni ouvrir", async () => {
    connecter(null);
    expect(await payer("r-titulaire")).toEqual(INEXISTANTE);
    expect(prismaSimule.reservation.findUnique).not.toHaveBeenCalled();
    expect(ouvrirPaiement).not.toHaveBeenCalled();
  });

  it("répond à un autre client comme pour une réservation inexistante", async () => {
    connecter("autre");
    const reponseAutre = await payer("r-titulaire");
    const reponseInexistante = await payer("r-qui-n-existe-pas");
    expect(reponseAutre).toEqual(INEXISTANTE);
    expect(reponseAutre).toEqual(reponseInexistante);
    expect(ouvrirPaiement).not.toHaveBeenCalled();
  });

  it.each(["EMPLOYE", "ADMIN"])("le rôle %s consulte mais ne paie pas pour le client", async (role) => {
    connecter("personnel", role);
    expect(await payer("r-titulaire")).toEqual(INEXISTANTE);
    expect(ouvrirPaiement).not.toHaveBeenCalled();
  });

  it("ouvre le paiement pour le titulaire et l'envoie sur Stripe", async () => {
    connecter("titulaire");
    await expect(payer("r-titulaire")).rejects.toThrow(
      "redirection:https://checkout.stripe.test/s",
    );
    expect(ouvrirPaiement).toHaveBeenCalledWith(
      "r-titulaire",
      "http://localhost:3000",
      expect.any(Date),
    );
  });
});
