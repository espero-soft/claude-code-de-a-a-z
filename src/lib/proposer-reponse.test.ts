import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { CONSIGNE_SUPPORT } from "./consigne-support";
import {
  ErreurReponseProposee,
  MODELE_REPONSE,
  proposerReponse,
  type ReservationLue,
} from "./proposer-reponse";
import type { ClientAnthropic, TriTicket } from "./tri-ticket";

// Réponse proposée au client. L'API Claude n'est jamais appelée : un faux client
// rejoue un brouillon écrit à la main.

const RESERVATION_AGORA: ReservationLue = {
  id: "resa-agora",
  debut: new Date("2026-11-24T13:00:00Z"), // 14 h à Paris
  fin: new Date("2026-11-24T15:00:00Z"),
  statut: "CONFIRMEE",
  montantTotalCentimes: 9000,
  salle: { nom: "Agora" },
};

const TRI_QUESTION: TriTicket = {
  categorie: "reservation",
  urgence: "basse",
  reservationId: "resa-agora",
  resume: "Le client demande le montant de sa réservation de l'Agora du 24 novembre.",
};

const TRI_ANNULATION: TriTicket = {
  categorie: "annulation",
  urgence: "normale",
  reservationId: "resa-agora",
  resume: "Le client demande l'annulation et le remboursement de l'Agora du 24 novembre.",
};

function brouillon(texte: string): Anthropic.Message {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text: texte }],
  } as unknown as Anthropic.Message;
}

function fauxClient(reponse: Anthropic.Message) {
  const create = vi.fn().mockResolvedValue(reponse);
  const client: ClientAnthropic = { messages: { create } };
  return { client, create };
}

describe("proposerReponse", () => {
  it("renvoie un brouillon qui cite le montant de la réservation", async () => {
    const texte =
      "Bonjour Camille Martin,\n\n" +
      "Votre réservation de l'Agora le mardi 24 novembre de 14 h à 16 h est confirmée, " +
      "pour un montant de 90,00 €.\n\nLe support du centre d'affaires";
    const { client, create } = fauxClient(brouillon(texte));

    const reponse = await proposerReponse(
      "Bonjour, combien coûte ma réservation de l'Agora ?\n\nCamille Martin",
      TRI_QUESTION,
      RESERVATION_AGORA,
      client,
    );

    expect(reponse).toEqual({
      statut: "BROUILLON",
      texte,
      aTransmettre: false,
      motifTransmission: null,
    });

    // Bon modèle, consigne du support en cache, données lues en base transmises.
    const params = create.mock.calls[0][0];
    expect(params.model).toBe(MODELE_REPONSE);
    expect(params.system).toEqual([
      { type: "text", text: CONSIGNE_SUPPORT, cache_control: { type: "ephemeral" } },
    ]);
    const tache = params.messages[0].content as string;
    expect(tache).toContain('"id": "resa-agora"');
    expect(tache).toMatch(/"montant": "90,00\s€"/);
  });

  it("refuse un brouillon qui invente un montant", async () => {
    const { client } = fauxClient(
      brouillon(
        "Bonjour Camille Martin,\n\nVotre réservation de l'Agora vous coûtera 120 € " +
          "(soit 60 euros de l'heure).\n\nLe support du centre d'affaires",
      ),
    );

    const promesse = proposerReponse("Combien ?", TRI_QUESTION, RESERVATION_AGORA, client);

    await expect(promesse).rejects.toBeInstanceOf(ErreurReponseProposee);
    await expect(promesse).rejects.toThrow(/« 120 € ».*« 60 euros ».*90,00\s€/);
  });

  it("refuse un montant inventé écrit avec des espaces insécables", async () => {
    const { client } = fauxClient(
      brouillon("Bonjour,\n\nLe total est de 1 234,50 €.\n\nLe support du centre d'affaires"),
    );

    await expect(
      proposerReponse("Combien ?", TRI_QUESTION, RESERVATION_AGORA, client),
    ).rejects.toThrow(/« 1 234,50 € »/);
  });

  it("refuse tout montant quand aucune réservation n'est fournie", async () => {
    const { client } = fauxClient(
      brouillon("Bonjour,\n\nUne salle coûte 45 € de l'heure.\n\nLe support du centre d'affaires"),
    );

    await expect(
      proposerReponse(
        "Quel est le prix d'une salle ?",
        { ...TRI_QUESTION, categorie: "autre", reservationId: null },
        null,
        client,
      ),
    ).rejects.toThrow(/« 45 € ».*aucune réservation fournie/);
  });

  it("détecte le passage à un conseiller et retire la ligne du texte client", async () => {
    const texteClient =
      "Bonjour Camille Martin,\n\n" +
      "Nous avons bien reçu votre demande d'annulation de l'Agora le mardi 24 novembre à 14 h, " +
      "réglée 90,00 €. Un conseiller va l'examiner et reviendra vers vous.\n\n" +
      "Le support du centre d'affaires";
    const { client } = fauxClient(
      brouillon(`${texteClient}\n\n[À transmettre à un conseiller : demande d'annulation et de remboursement]`),
    );

    const reponse = await proposerReponse(
      "Je dois annuler, pouvez-vous me rembourser ?\n\nCamille Martin",
      TRI_ANNULATION,
      RESERVATION_AGORA,
      client,
    );

    expect(reponse).toEqual({
      statut: "BROUILLON",
      texte: texteClient,
      aTransmettre: true,
      motifTransmission: "demande d'annulation et de remboursement",
    });
  });

  it.each(["annulation", "paiement"] as const)(
    "force la transmission pour la catégorie %s, même sans la ligne",
    async (categorie) => {
      const texte =
        "Bonjour Camille Martin,\n\nNous avons bien reçu votre demande concernant l'Agora " +
        "le mardi 24 novembre à 14 h.\n\nLe support du centre d'affaires";
      const { client } = fauxClient(brouillon(texte)); // pas de ligne de transmission

      const reponse = await proposerReponse(
        "Bonjour, j'ai un souci avec ma réservation.\n\nCamille Martin",
        { ...TRI_ANNULATION, categorie },
        RESERVATION_AGORA,
        client,
      );

      expect(reponse).toEqual({
        statut: "BROUILLON",
        texte,
        aTransmettre: true,
        motifTransmission: `catégorie ${categorie} (ligne de transmission absente du brouillon)`,
      });
    },
  );
});
