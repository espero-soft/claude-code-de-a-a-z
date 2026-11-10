import { describe, expect, it } from "vitest";
import { adminDisponible, ordonnerTickets, type StatutTicket, type Urgence } from "./admin-tickets";

describe("adminDisponible", () => {
  it("ouvre l'administration en développement", () => {
    expect(adminDisponible("development")).toBe(true);
  });

  it("la ferme en production", () => {
    expect(adminDisponible("production")).toBe(false);
  });

  it("la ferme par défaut si NODE_ENV est absent ou inattendu", () => {
    expect(adminDisponible(undefined)).toBe(false);
    expect(adminDisponible("test")).toBe(false);
  });
});

describe("ordonnerTickets", () => {
  const ticket = (id: string, urgence: Urgence, statut: StatutTicket, heure: string) => ({
    id,
    urgence,
    statut,
    createdAt: new Date(`2026-11-10T${heure}:00Z`),
  });

  it("place les plus urgents d'abord", () => {
    const tickets = [
      ticket("b", "basse", "A_TRAITER", "08:00"),
      ticket("h", "haute", "A_TRAITER", "10:00"),
      ticket("n", "normale", "A_TRAITER", "09:00"),
    ];
    expect(ordonnerTickets(tickets).map((t) => t.id)).toEqual(["h", "n", "b"]);
  });

  it("à urgence égale, met les tickets à traiter avant les validés", () => {
    const tickets = [
      ticket("valide", "haute", "VALIDE", "08:00"),
      ticket("a-traiter", "haute", "A_TRAITER", "10:00"),
    ];
    expect(ordonnerTickets(tickets).map((t) => t.id)).toEqual(["a-traiter", "valide"]);
  });

  it("à urgence et statut égaux, met le plus ancien d'abord", () => {
    const tickets = [
      ticket("recent", "normale", "A_TRAITER", "11:00"),
      ticket("ancien", "normale", "A_TRAITER", "09:00"),
    ];
    expect(ordonnerTickets(tickets).map((t) => t.id)).toEqual(["ancien", "recent"]);
  });

  it("garde l'urgence avant le statut : un ticket haut validé passe avant un ticket bas à traiter", () => {
    const tickets = [
      ticket("bas", "basse", "A_TRAITER", "08:00"),
      ticket("haut", "haute", "VALIDE", "09:00"),
    ];
    expect(ordonnerTickets(tickets).map((t) => t.id)).toEqual(["haut", "bas"]);
  });

  it("ne modifie pas le tableau reçu", () => {
    const tickets = [
      ticket("b", "basse", "A_TRAITER", "08:00"),
      ticket("h", "haute", "A_TRAITER", "09:00"),
    ];
    ordonnerTickets(tickets);
    expect(tickets.map((t) => t.id)).toEqual(["b", "h"]);
  });
});
