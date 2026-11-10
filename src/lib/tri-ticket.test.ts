import type Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONSIGNE_SUPPORT } from "./consigne-support";
import { ErreurTriTicket, MODELE_TRI, trierTicket, type ClientAnthropic } from "./tri-ticket";

// Tri des tickets du support. L'API Claude n'est jamais appelée : un faux client
// rejoue des réponses du modèle écrites à la main. Prisma est remplacé par un faux.

const faux = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { reservation: { findMany: faux.findMany } },
}));

const EMAIL = "camille@example.com";
const MESSAGE_ANNULATION =
  "Bonjour, j'ai réservé l'Agora pour le mardi 24 novembre à 14 h, mais notre réunion est reportée. " +
  "Je dois annuler : pouvez-vous me rembourser ?\n\nCamille Martin";

const RESERVATION_AGORA = {
  id: "resa-agora",
  debut: new Date("2026-11-24T13:00:00Z"), // 14 h à Paris
  fin: new Date("2026-11-24T15:00:00Z"),
  statut: "CONFIRMEE",
  montantTotalCentimes: 9000,
  salle: { nom: "Agora" },
};

// Réponses du modèle, réduites aux champs que lit trierTicket.
function appelOutil(email: string): Anthropic.Message {
  return {
    stop_reason: "tool_use",
    content: [
      { type: "tool_use", id: "appel-1", name: "chercher_reservation", input: { email } },
    ],
  } as unknown as Anthropic.Message;
}

function reponseFinale(texte: string): Anthropic.Message {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text: texte }],
  } as unknown as Anthropic.Message;
}

function fauxClient(...reponses: Anthropic.Message[]) {
  const create = vi.fn();
  for (const r of reponses) create.mockResolvedValueOnce(r);
  const client: ClientAnthropic = { messages: { create } };
  return { client, create };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("trierTicket", () => {
  it("trie une annulation et retrouve la réservation par l'outil", async () => {
    faux.findMany.mockResolvedValue([RESERVATION_AGORA]);
    const { client, create } = fauxClient(
      appelOutil(EMAIL),
      reponseFinale(
        JSON.stringify({
          categorie: "annulation",
          urgence: "normale",
          reservationId: "resa-agora",
          resume: "Le client demande l'annulation et le remboursement de l'Agora du 24 novembre.",
        }),
      ),
    );

    const tri = await trierTicket(MESSAGE_ANNULATION, EMAIL, client);

    expect(tri).toEqual({
      categorie: "annulation",
      urgence: "normale",
      reservationId: "resa-agora",
      resume: "Le client demande l'annulation et le remboursement de l'Agora du 24 novembre.",
    });
    // L'outil a lu la base avec l'e-mail du client, en lecture seule.
    expect(faux.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { emailClient: EMAIL } }),
    );

    // Premier appel : bon modèle, consigne du support en cache, outil fourni.
    const premier = create.mock.calls[0][0];
    expect(premier.model).toBe(MODELE_TRI);
    expect(premier.system).toEqual([
      { type: "text", text: CONSIGNE_SUPPORT, cache_control: { type: "ephemeral" } },
    ]);
    expect(premier.tools.map((t: Anthropic.Tool) => t.name)).toEqual(["chercher_reservation"]);

    // Second appel : le résultat de l'outil est rendu au modèle.
    const second = create.mock.calls[1][0];
    const resultat = second.messages.at(-1).content[0];
    expect(resultat).toMatchObject({ type: "tool_result", tool_use_id: "appel-1" });
    expect(JSON.parse(resultat.content)).toEqual([
      expect.objectContaining({ id: "resa-agora", salle: "Agora", statut: "CONFIRMEE" }),
    ]);
  });

  it("renvoie reservationId null pour un message sans réservation", async () => {
    faux.findMany.mockResolvedValue([]);
    const { client } = fauxClient(
      appelOutil("nouveau@example.com"),
      reponseFinale(
        JSON.stringify({
          categorie: "autre",
          urgence: "basse",
          reservationId: null,
          resume: "Le client demande si les salles disposent d'un vidéoprojecteur.",
        }),
      ),
    );

    const tri = await trierTicket(
      "Bonjour, vos salles ont-elles un vidéoprojecteur ?",
      "nouveau@example.com",
      client,
    );

    expect(tri.categorie).toBe("autre");
    expect(tri.urgence).toBe("basse");
    expect(tri.reservationId).toBeNull();
  });

  it("lève une erreur claire si la réponse du modèle est hors format", async () => {
    faux.findMany.mockResolvedValue([RESERVATION_AGORA]);
    const { client } = fauxClient(
      appelOutil(EMAIL),
      reponseFinale(
        JSON.stringify({
          categorie: "remboursement", // catégorie inconnue
          urgence: "moyenne", // urgence inconnue
          reservationId: "resa-agora",
          // resume manquant
        }),
      ),
    );

    const promesse = trierTicket(MESSAGE_ANNULATION, EMAIL, client);

    await expect(promesse).rejects.toBeInstanceOf(ErreurTriTicket);
    await expect(promesse).rejects.toThrow(/hors format.*categorie.*urgence.*resume/);
  });
});
