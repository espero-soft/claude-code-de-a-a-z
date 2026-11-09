import { describe, expect, it } from "vitest";
import { estExpiree } from "./expiration";

// R6 : une réservation en attente de paiement depuis plus de 15 minutes est expirée.
// `maintenant` est injecté pour des tests déterministes.

// Réservation créée le mardi 10 novembre 2026 à 9 h 00 (UTC, la durée ne dépend pas du fuseau).
const creeeA = new Date("2026-11-10T09:00:00Z");
const apres = (minutes: number, secondes = 0) =>
  new Date(creeeA.getTime() + (minutes * 60 + secondes) * 1000);

function reservation(
  statut: "EN_ATTENTE" | "CONFIRMEE" | "ANNULEE" = "EN_ATTENTE",
) {
  return { statut, createdAt: creeeA };
}

describe("estExpiree (R6)", () => {
  it("n'expire pas une réservation en attente qui vient d'être créée", () => {
    expect(estExpiree(reservation(), apres(0))).toBe(false);
  });

  it("n'expire pas une réservation en attente depuis moins de 15 minutes", () => {
    expect(estExpiree(reservation(), apres(10))).toBe(false);
    expect(estExpiree(reservation(), apres(14, 59))).toBe(false);
  });

  it("n'expire pas une réservation en attente depuis exactement 15 minutes", () => {
    // « plus de 15 minutes » : la limite elle-même n'est pas dépassée.
    expect(estExpiree(reservation(), apres(15))).toBe(false);
  });

  it("expire une réservation en attente depuis plus de 15 minutes", () => {
    expect(estExpiree(reservation(), apres(15, 1))).toBe(true);
    expect(estExpiree(reservation(), apres(60))).toBe(true);
  });

  it("n'expire jamais une réservation confirmée", () => {
    expect(estExpiree(reservation("CONFIRMEE"), apres(60))).toBe(false);
  });

  it("n'expire pas une réservation déjà annulée", () => {
    expect(estExpiree(reservation("ANNULEE"), apres(60))).toBe(false);
  });
});
