// La Server Action payer se protège seule : appelée directement (POST forgé,
// sans page ni proxy), elle n'ouvre un paiement que pour le titulaire, et
// répond aux autres exactement comme pour une réservation inexistante.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, prismaSimule, ouvrirPaiement } = vi.hoisted(() => ({
  getSession: vi.fn(),
  prismaSimule: {
    user: { findUnique: vi.fn() },
    session: { findUnique: vi.fn() },
    reservation: { findUnique: vi.fn() },
  },
  ouvrirPaiement: vi.fn(),
}));

// En-tête Origin forgé : l'adresse de retour du paiement ne doit jamais en venir.
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "https://site-pirate.exemple" }),
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
  getSession.mockResolvedValue({ user: { id }, session: { id: `session-${id}` } });
  // Personnel : second facteur enrôlé et validé il y a une minute.
  prismaSimule.user.findUnique.mockResolvedValue({
    id,
    email: `${id}@exemple.fr`,
    name: "",
    role,
    twofactors: [{ id: "f1" }],
  });
  prismaSimule.session.findUnique.mockResolvedValue({ deuxiemeFacteurLe: new Date(Date.now() - 60_000) });
}

// En base : « r-titulaire » appartient au compte « titulaire » ; tout autre
// identifiant n'existe pas.
beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("BETTER_AUTH_URL", "https://reservations.exemple.fr/");
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
    // Retour après paiement : l'adresse configurée, pas l'en-tête Origin forgé.
    expect(ouvrirPaiement).toHaveBeenCalledWith(
      "r-titulaire",
      "https://reservations.exemple.fr",
      expect.any(Date),
    );
  });

  it("n'ouvre aucun paiement si l'adresse publique n'est pas configurée", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    connecter("titulaire");
    expect(await payer("r-titulaire")).toEqual({
      erreur: "Le paiement est momentanément indisponible. Réessayez dans quelques instants.",
    });
    expect(ouvrirPaiement).not.toHaveBeenCalled();
  });
});
