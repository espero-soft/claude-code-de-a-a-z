import { beforeEach, describe, expect, it, vi } from "vitest";
import { actualiserReservation, ouvrirPaiement } from "./suivi-paiement";

// Suivi du paiement sans webhook : la session Checkout est relue auprès de
// Stripe à la consultation et au clic sur « Payer ». R6 (annulation après
// 15 minutes), R3 (revérifiée à la confirmation) et R5 (montant de la base).
// Prisma, Stripe et confirmerReservation sont remplacés par des faux.

const faux = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  findMany: vi.fn(),
  retrieve: vi.fn(),
  create: vi.fn(),
  expire: vi.fn(),
  refund: vi.fn(),
  confirmerReservation: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    reservation: {
      findUnique: faux.findUnique,
      updateMany: faux.updateMany,
      findMany: faux.findMany,
    },
  },
}));
vi.mock("@/lib/stripe", () => ({
  obtenirStripe: () => ({
    checkout: {
      sessions: { retrieve: faux.retrieve, create: faux.create, expire: faux.expire },
    },
    refunds: { create: faux.refund },
  }),
}));
vi.mock("@/lib/confirmation", () => ({
  confirmerReservation: faux.confirmerReservation,
}));

// Réservation créée le mardi 10 novembre 2026 à 9 h 00 (UTC, seule la durée compte).
const creeeA = new Date("2026-11-10T09:00:00Z");
const apres = (minutes: number, secondes = 0) =>
  new Date(creeeA.getTime() + (minutes * 60 + secondes) * 1000);

const MONTANT = 8000; // 2 h à 40 € de l'heure
const ORIGINE = "http://localhost:3000";

// Réservation EN_ATTENTE d'Horizon, le jeudi 12 novembre 2026 de 10 h à 12 h à Paris.
function reservation(changements: Record<string, unknown> = {}) {
  return {
    id: "resa-1",
    salleId: "salle-a",
    debut: new Date("2026-11-12T10:00:00+01:00"),
    fin: new Date("2026-11-12T12:00:00+01:00"),
    nomClient: "Jeanne Martin",
    emailClient: "jeanne@example.com",
    statut: "EN_ATTENTE",
    montantTotalCentimes: MONTANT,
    stripeSessionId: null as string | null,
    createdAt: creeeA,
    salle: { id: "salle-a", nom: "Horizon" },
    ...changements,
  };
}

// Session Checkout payée, encaissée `payeeA`.
function sessionPayee(payeeA: Date) {
  return {
    id: "cs_test_1",
    status: "complete",
    payment_status: "paid",
    amount_total: MONTANT,
    currency: "eur",
    client_reference_id: "resa-1",
    payment_intent: { id: "pi_1", latest_charge: { created: payeeA.getTime() / 1000 } },
    url: null,
  };
}

const sessionOuverte = {
  id: "cs_test_1",
  status: "open",
  payment_status: "unpaid",
  amount_total: MONTANT,
  currency: "eur",
  client_reference_id: "resa-1",
  payment_intent: null,
  url: "https://checkout.stripe.com/c/pay/cs_test_1",
};

// La base renvoie `avant` à la première lecture, puis `ensuite` (relecture finale).
function base(avant: object | null, ensuite: object | null = avant) {
  faux.findUnique.mockResolvedValueOnce(avant).mockResolvedValue(ensuite);
}

beforeEach(() => {
  vi.resetAllMocks();
  faux.updateMany.mockResolvedValue({ count: 1 });
  faux.findMany.mockResolvedValue([]);
});

describe("actualiserReservation", () => {
  it("n'interroge pas Stripe pour une réservation déjà confirmée", async () => {
    base(reservation({ statut: "CONFIRMEE", stripeSessionId: "cs_test_1" }));

    const { reservation: lue } = await actualiserReservation("resa-1", apres(60));

    expect(lue?.statut).toBe("CONFIRMEE");
    expect(faux.retrieve).not.toHaveBeenCalled();
    expect(faux.updateMany).not.toHaveBeenCalled();
  });

  it("ne change rien à une réservation en attente depuis moins de 15 minutes", async () => {
    base(reservation());

    await actualiserReservation("resa-1", apres(14, 59));

    expect(faux.updateMany).not.toHaveBeenCalled();
  });

  it("R6 : annule une réservation jamais payée après 15 minutes", async () => {
    base(reservation(), reservation({ statut: "ANNULEE" }));

    const { reservation: lue } = await actualiserReservation("resa-1", apres(15, 1));

    // Écriture conditionnelle : une confirmation simultanée l'emporte.
    expect(faux.updateMany).toHaveBeenCalledWith({
      where: { id: "resa-1", statut: "EN_ATTENTE" },
      data: { statut: "ANNULEE" },
    });
    expect(lue?.statut).toBe("ANNULEE");
    expect(faux.retrieve).not.toHaveBeenCalled();
  });

  it("R6 : ferme la session Checkout ouverte avant d'annuler", async () => {
    base(reservation({ stripeSessionId: "cs_test_1" }));
    faux.retrieve.mockResolvedValue(sessionOuverte);

    await actualiserReservation("resa-1", apres(16));

    expect(faux.expire).toHaveBeenCalledWith("cs_test_1");
    expect(faux.updateMany).toHaveBeenCalledTimes(1);
    expect(faux.expire.mock.invocationCallOrder[0]).toBeLessThan(
      faux.updateMany.mock.invocationCallOrder[0],
    );
  });

  it("n'annule pas si la session ne peut plus être fermée (payée entre-temps)", async () => {
    base(reservation({ stripeSessionId: "cs_test_1" }));
    faux.retrieve.mockResolvedValue(sessionOuverte);
    faux.expire.mockRejectedValue(new Error("session déjà terminée"));

    await actualiserReservation("resa-1", apres(16));

    expect(faux.updateMany).not.toHaveBeenCalled();
  });

  it("vérifie le paiement auprès de Stripe puis confirme (R3)", async () => {
    base(
      reservation({ stripeSessionId: "cs_test_1" }),
      reservation({ statut: "CONFIRMEE" }),
    );
    faux.retrieve.mockResolvedValue(sessionPayee(apres(10)));
    faux.confirmerReservation.mockResolvedValue({ ok: true });

    const { reservation: lue } = await actualiserReservation("resa-1", apres(11));

    expect(faux.retrieve).toHaveBeenCalledWith("cs_test_1", {
      expand: ["payment_intent.latest_charge"],
    });
    expect(faux.confirmerReservation).toHaveBeenCalledWith("resa-1");
    expect(faux.refund).not.toHaveBeenCalled();
    expect(lue?.statut).toBe("CONFIRMEE");
  });

  it("R3 : rembourse puis annule si le créneau a été confirmé pour un autre client", async () => {
    base(reservation({ stripeSessionId: "cs_test_1" }));
    faux.retrieve.mockResolvedValue(sessionPayee(apres(10)));
    faux.confirmerReservation.mockResolvedValue({ ok: false, raison: "creneau-pris" });

    await actualiserReservation("resa-1", apres(11));

    expect(faux.refund).toHaveBeenCalledWith(
      { payment_intent: "pi_1" },
      { idempotencyKey: "remboursement-pi_1" },
    );
    expect(faux.updateMany).toHaveBeenCalledWith({
      where: { id: "resa-1", statut: "EN_ATTENTE" },
      data: { statut: "ANNULEE" },
    });
  });

  it("R6 : rembourse et annule un paiement encaissé après 15 minutes", async () => {
    base(reservation({ stripeSessionId: "cs_test_1" }));
    faux.retrieve.mockResolvedValue(sessionPayee(apres(15, 1)));

    await actualiserReservation("resa-1", apres(16));

    expect(faux.confirmerReservation).not.toHaveBeenCalled();
    expect(faux.refund).toHaveBeenCalledTimes(1);
    // Rembourser d'abord : une annulation ratée sera reprise sans double remboursement.
    expect(faux.refund.mock.invocationCallOrder[0]).toBeLessThan(
      faux.updateMany.mock.invocationCallOrder[0],
    );
  });
});

describe("ouvrirPaiement", () => {
  it("crée une session Checkout au montant enregistré en base (R5)", async () => {
    base(reservation());
    faux.create.mockResolvedValue({ id: "cs_test_2", url: "https://checkout.stripe.com/2" });

    const resultat = await ouvrirPaiement("resa-1", ORIGINE, apres(5));

    expect(resultat).toEqual({ ok: true, url: "https://checkout.stripe.com/2" });
    const parametres = faux.create.mock.calls[0][0];
    expect(parametres.mode).toBe("payment");
    expect(parametres.client_reference_id).toBe("resa-1");
    expect(parametres.line_items).toEqual([
      expect.objectContaining({
        quantity: 1,
        price_data: expect.objectContaining({ currency: "eur", unit_amount: MONTANT }),
      }),
    ]);
    expect(parametres.success_url).toBe(`${ORIGINE}/reservations/resa-1`);
    // N'enregistre la session que si personne ne l'a remplacée entre-temps.
    expect(faux.updateMany).toHaveBeenCalledWith({
      where: { id: "resa-1", statut: "EN_ATTENTE", stripeSessionId: null },
      data: { stripeSessionId: "cs_test_2" },
    });
  });

  it("reprend la session Checkout déjà ouverte", async () => {
    base(reservation({ stripeSessionId: "cs_test_1" }));
    faux.retrieve.mockResolvedValue(sessionOuverte);

    const resultat = await ouvrirPaiement("resa-1", ORIGINE, apres(5));

    expect(resultat).toEqual({ ok: true, url: sessionOuverte.url });
    expect(faux.create).not.toHaveBeenCalled();
  });

  it("R6 : ne fait pas payer une réservation en attente depuis plus de 15 minutes", async () => {
    base(reservation(), reservation({ statut: "ANNULEE" }));

    const resultat = await ouvrirPaiement("resa-1", ORIGINE, apres(15, 1));

    expect(resultat).toEqual({ ok: true, url: "/reservations/resa-1" });
    expect(faux.create).not.toHaveBeenCalled();
  });

  it("R3 : refuse de faire payer un créneau déjà confirmé pour un autre client", async () => {
    base(reservation());
    faux.findMany.mockResolvedValue([
      {
        id: "resa-2",
        salleId: "salle-a",
        statut: "CONFIRMEE",
        debut: new Date("2026-11-12T11:00:00+01:00"),
        fin: new Date("2026-11-12T13:00:00+01:00"),
      },
    ]);

    const resultat = await ouvrirPaiement("resa-1", ORIGINE, apres(5));

    expect(resultat).toEqual({
      ok: false,
      erreur: "Cette salle est déjà réservée de 11 h à 13 h. Choisissez un autre horaire.",
    });
    expect(faux.create).not.toHaveBeenCalled();
  });

  it("ferme la nouvelle session si une autre a été enregistrée entre-temps (double clic)", async () => {
    base(reservation());
    faux.create.mockResolvedValue({ id: "cs_test_2", url: "https://checkout.stripe.com/2" });
    faux.updateMany.mockResolvedValue({ count: 0 });

    const resultat = await ouvrirPaiement("resa-1", ORIGINE, apres(5));

    expect(faux.expire).toHaveBeenCalledWith("cs_test_2");
    expect(resultat).toEqual({ ok: true, url: "/reservations/resa-1" });
  });

  it("signale une réservation inexistante", async () => {
    base(null);

    expect(await ouvrirPaiement("inconnue", ORIGINE, apres(5))).toEqual({
      ok: false,
      erreur: "Cette réservation n'existe pas.",
    });
  });
});
