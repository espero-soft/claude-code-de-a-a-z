import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaSimule } = vi.hoisted(() => ({
  prismaSimule: {
    user: { findUnique: vi.fn() },
    reservation: { findMany: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaSimule }));

import { rattacherReservationsSansCompte, reservationsARattacher } from "./rattachement";

const claire = { id: "claire", email: "claire@exemple.fr", emailVerified: true };

// Réservations en base : deux de Claire sans compte (casse et espaces
// différents), une d'une autre personne, une de Claire déjà rattachée à un
// autre compte.
const CANDIDATES = [
  { id: "r1", emailClient: "claire@exemple.fr", utilisateurId: null },
  { id: "r2", emailClient: "  Claire@Exemple.FR ", utilisateurId: null },
  { id: "r3", emailClient: "camille@exemple.fr", utilisateurId: null },
  { id: "r4", emailClient: "claire@exemple.fr", utilisateurId: "un-autre-compte" },
];

describe("reservationsARattacher", () => {
  it("rattache les réservations sans compte de la même adresse vérifiée, quelle que soit la casse", () => {
    expect(reservationsARattacher(claire, CANDIDATES)).toEqual(["r1", "r2"]);
  });

  it("ne rattache rien si l'adresse du compte n'est pas vérifiée", () => {
    expect(reservationsARattacher({ ...claire, emailVerified: false }, CANDIDATES)).toEqual([]);
  });

  it("ne reprend jamais une réservation qui a déjà un titulaire", () => {
    expect(reservationsARattacher(claire, CANDIDATES)).not.toContain("r4");
  });

  it("ne rattache pas les réservations d'une autre adresse", () => {
    expect(reservationsARattacher(claire, CANDIDATES)).not.toContain("r3");
  });

  it("une adresse vide ne correspond à rien", () => {
    expect(
      reservationsARattacher({ ...claire, email: " " }, [
        { id: "vide", emailClient: "", utilisateurId: null },
      ]),
    ).toEqual([]);
  });
});

describe("rattacherReservationsSansCompte", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaSimule.reservation.findMany.mockResolvedValue(CANDIDATES);
    prismaSimule.reservation.updateMany.mockResolvedValue({ count: 2 });
  });

  it("adresse vérifiée : écrit le titulaire, en revérifiant qu'il n'y en a pas encore", async () => {
    prismaSimule.user.findUnique.mockResolvedValue(claire);
    expect(await rattacherReservationsSansCompte("claire")).toBe(2);
    expect(prismaSimule.reservation.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["r1", "r2"] }, utilisateurId: null },
      data: { utilisateurId: "claire" },
    });
  });

  it("adresse non vérifiée : ne lit ni n'écrit aucune réservation", async () => {
    prismaSimule.user.findUnique.mockResolvedValue({ ...claire, emailVerified: false });
    expect(await rattacherReservationsSansCompte("claire")).toBe(0);
    expect(prismaSimule.reservation.findMany).not.toHaveBeenCalled();
    expect(prismaSimule.reservation.updateMany).not.toHaveBeenCalled();
  });

  it("compte inconnu : rien", async () => {
    prismaSimule.user.findUnique.mockResolvedValue(null);
    expect(await rattacherReservationsSansCompte("fantome")).toBe(0);
    expect(prismaSimule.reservation.updateMany).not.toHaveBeenCalled();
  });
});
