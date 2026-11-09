import { describe, expect, it, vi } from "vitest";
import type { ReservationExistante } from "./chevauchement";
import { trouverConflitConfirme } from "./conflit-confirme";

// Heures du mardi 10 novembre 2026 (UTC).
const h = (heure: string) => new Date(`2026-11-10T${heure}:00Z`);

// Faux client Prisma : enregistre la requête et renvoie les lignes fournies.
function fauxClient(lignes: ReservationExistante[] = []) {
  const findMany = vi.fn().mockResolvedValue(lignes);
  // Seule la méthode findMany est utilisée par trouverConflitConfirme.
  const client = { reservation: { findMany } } as unknown as Parameters<
    typeof trouverConflitConfirme
  >[0];
  return { client, findMany };
}

describe("trouverConflitConfirme (R3, côté base)", () => {
  // Le résultat seul ne suffit pas à tester la requête : conflitConfirme
  // refiltre les lignes renvoyées, donc une requête trop large (lte/gte)
  // passerait inaperçue. On vérifie la requête elle-même.
  it("ne demande à la base que les confirmées qui chevauchent strictement", async () => {
    const { client, findMany } = fauxClient();
    const demande = { salleId: "salle-a", debut: h("12:00"), fin: h("13:00") };

    await trouverConflitConfirme(client, demande);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where).toEqual({
      salleId: "salle-a",
      statut: "CONFIRMEE",
      // Bornes strictes : une réservation qui finit à 12 h ou commence à 13 h
      // touche le créneau sans le chevaucher.
      debut: { lt: h("13:00") },
      fin: { gt: h("12:00") },
    });
  });

  it("renvoie la réservation en conflit trouvée par la base", async () => {
    const existante: ReservationExistante = {
      id: "r1",
      salleId: "salle-a",
      statut: "CONFIRMEE",
      debut: h("10:00"),
      fin: h("12:00"),
    };
    const { client } = fauxClient([existante]);

    const conflit = await trouverConflitConfirme(client, {
      salleId: "salle-a",
      debut: h("11:00"),
      fin: h("12:30"),
    });

    expect(conflit).toEqual(existante);
  });
});
