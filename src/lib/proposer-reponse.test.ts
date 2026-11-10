import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { CONSIGNE_SUPPORT } from "./consigne-support";
import { NOM_OUTIL_PROPOSER, OUTIL_PROPOSER_CRENEAU } from "./outil-proposer-creneau";
import {
  creneauxCites,
  ErreurReponseProposee,
  MODELE_REPONSE,
  proposerReponse,
  type ReservationLue,
} from "./proposer-reponse";
import type { ClientAnthropic, TriTicket } from "./tri-ticket";

// Réponse proposée au client. L'API Claude n'est jamais appelée : un faux client
// rejoue un brouillon écrit à la main.

// L'outil proposer_creneau_libre lit la base : un faux Prisma renvoie la salle
// et ses réservations confirmées. La recherche (R1 à R4) reste la vraie.
const faussesDonnees = vi.hoisted(() => ({
  salle: { findFirst: vi.fn() },
  reservation: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: faussesDonnees }));

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

// Le faux client rejoue les réponses dans l'ordre (la dernière ensuite).
function fauxClient(...reponses: Anthropic.Message[]) {
  const create = vi.fn();
  for (const r of reponses) create.mockResolvedValueOnce(r);
  create.mockResolvedValue(reponses.at(-1));
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
      creneauxProposes: [],
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
      creneauxProposes: [],
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
        creneauxProposes: [],
      });
    },
  );
});

// --- Outil proposer_creneau_libre -------------------------------------------

// Mardi 10 novembre 2026, 13 h 20 à Paris.
const MAINTENANT = new Date("2026-11-10T12:20:00Z");

const MESSAGE_LEA =
  "Bonjour, je voudrais réserver l'Agora le mardi 24 novembre de 14 h à 16 h pour une réunion " +
  "de 8 personnes. Est-ce possible ?\n\nLéa Roux";

const TRI_NOUVELLE_RESERVATION: TriTicket = {
  categorie: "reservation",
  urgence: "normale",
  reservationId: null,
  resume: "La cliente veut réserver l'Agora le mardi 24 novembre de 14 h à 16 h.",
};

function appelOutil(input: unknown, id = "appel-1"): Anthropic.Message {
  return {
    stop_reason: "tool_use",
    content: [
      { type: "text", text: "Je vérifie les disponibilités." },
      { type: "tool_use", id, name: NOM_OUTIL_PROPOSER, input },
    ],
  } as unknown as Anthropic.Message;
}

const DEMANDE_AGORA = { salle: "agora", date: "2026-11-24", heureDebut: "14:00", dureeMinutes: 120 };

// L'Agora est prise le mardi 24 novembre de 14 h à 16 h (réservation confirmée).
function agoraPriseLe24() {
  faussesDonnees.salle.findFirst.mockResolvedValue({ id: "salle-agora", nom: "Agora" });
  faussesDonnees.reservation.findMany.mockResolvedValue([
    {
      id: "resa-camille",
      salleId: "salle-agora",
      statut: "CONFIRMEE",
      debut: new Date("2026-11-24T13:00:00Z"),
      fin: new Date("2026-11-24T15:00:00Z"),
    },
  ]);
}

const BROUILLON_LEA =
  "Bonjour Léa Roux,\n\n" +
  "L'Agora n'est pas disponible le mardi 24 novembre de 14 h à 16 h : elle est déjà réservée " +
  "sur ce créneau. Le même jour, elle est libre à ce jour :\n" +
  "- le mardi 24 novembre de 16 h à 18 h ;\n" +
  "- le mardi 24 novembre de 16 h 30 à 18 h 30 ;\n" +
  "- le mardi 24 novembre de 17 h à 19 h.\n\n" +
  "Ces créneaux ne sont pas bloqués : pour en retenir un, réservez puis payez sur le site.\n\n" +
  "Le support du centre d'affaires";

describe("proposerReponse avec l'outil proposer_creneau_libre", () => {
  it("ne propose pas l'outil pour un ticket qui n'est pas une réservation", async () => {
    const { client, create } = fauxClient(brouillon("Bonjour,\n\nC'est noté.\n\nLe support"));

    await proposerReponse("Je dois annuler.", TRI_ANNULATION, RESERVATION_AGORA, client, {
      maintenant: MAINTENANT,
    });

    const params = create.mock.calls[0][0];
    expect(params.tools).toBeUndefined();
    expect(params.messages[0].content).not.toContain("proposer_creneau_libre");
  });

  it("propose l'outil pour une réservation, avec la date du jour et sa consigne d'usage", async () => {
    const { client, create } = fauxClient(brouillon("Bonjour,\n\nC'est possible.\n\nLe support"));

    await proposerReponse(MESSAGE_LEA, TRI_NOUVELLE_RESERVATION, null, client, {
      maintenant: MAINTENANT,
    });

    const params = create.mock.calls[0][0];
    expect(params.tools).toEqual([OUTIL_PROPOSER_CRENEAU]);
    const tache = params.messages[0].content as string;
    expect(tache).toContain("mardi 10 novembre 2026");
    expect(tache).toMatch(
      /utilise-le uniquement si le client demande à réserver une salle\nou à changer le créneau/,
    );
  });

  it("exécute l'outil, lui rend son résultat et accepte les créneaux qu'il a proposés", async () => {
    agoraPriseLe24();
    const { client, create } = fauxClient(appelOutil(DEMANDE_AGORA), brouillon(BROUILLON_LEA));
    const surAppelOutil = vi.fn();

    const reponse = await proposerReponse(MESSAGE_LEA, TRI_NOUVELLE_RESERVATION, null, client, {
      maintenant: MAINTENANT,
      surAppelOutil,
    });

    expect(reponse).toEqual({
      statut: "BROUILLON",
      texte: BROUILLON_LEA,
      aTransmettre: false,
      motifTransmission: null,
      creneauxProposes: [
        { date: "2026-11-24", heureDebut: "16:00", heureFin: "18:00" },
        { date: "2026-11-24", heureDebut: "16:30", heureFin: "18:30" },
        { date: "2026-11-24", heureDebut: "17:00", heureFin: "19:00" },
      ],
    });

    // Deuxième tour : réponse du modèle rendue, puis le résultat de l'outil.
    expect(create).toHaveBeenCalledTimes(2);
    const messages = create.mock.calls[1][0].messages;
    expect(messages).toHaveLength(3);
    expect(messages[1].role).toBe("assistant");
    const [resultat] = messages[2].content;
    expect(resultat).toMatchObject({ type: "tool_result", tool_use_id: "appel-1" });
    expect(JSON.parse(resultat.content)).toMatchObject({
      salle: "Agora",
      demandeLibre: false,
      motif: "Cette salle est déjà réservée de 14 h à 16 h. Choisissez un autre horaire.",
    });
    expect(surAppelOutil).toHaveBeenCalledOnce();
  });

  it("refuse un créneau qui ne figure pas dans les résultats de l'outil", async () => {
    agoraPriseLe24();
    const { client } = fauxClient(
      appelOutil(DEMANDE_AGORA),
      brouillon(
        "Bonjour Léa Roux,\n\nL'Agora est prise, mais elle est libre le mardi 24 novembre " +
          "de 18 h à 20 h.\n\nLe support du centre d'affaires",
      ),
    );

    await expect(
      proposerReponse(MESSAGE_LEA, TRI_NOUVELLE_RESERVATION, null, client, { maintenant: MAINTENANT }),
    ).rejects.toThrow(/créneau non proposé par l'outil « de 18 h à 20 h » \(24\/11\)/);
  });

  it("refuse les bonnes heures à une autre date que celle proposée", async () => {
    agoraPriseLe24();
    const { client } = fauxClient(
      appelOutil(DEMANDE_AGORA),
      brouillon(
        "Bonjour Léa Roux,\n\nJe vous propose de 16 h à 18 h le mercredi 25 novembre." +
          "\n\nLe support du centre d'affaires",
      ),
    );

    await expect(
      proposerReponse(MESSAGE_LEA, TRI_NOUVELLE_RESERVATION, null, client, { maintenant: MAINTENANT }),
    ).rejects.toThrow(/« de 16 h à 18 h » \(25\/11\)/);
  });

  it("refuse un créneau inventé quand l'outil n'a pas été appelé", async () => {
    const { client } = fauxClient(
      brouillon("Bonjour,\n\nL'Agora est libre jeudi 26 novembre de 9 h à 11 h.\n\nLe support"),
    );

    await expect(
      proposerReponse(MESSAGE_LEA, TRI_NOUVELLE_RESERVATION, null, client, { maintenant: MAINTENANT }),
    ).rejects.toThrow(/« de 9 h à 11 h » \(26\/11\)/);
  });

  it("renvoie une erreur d'outil au modèle sans rien proposer", async () => {
    faussesDonnees.salle.findFirst.mockResolvedValue(null);
    const { client, create } = fauxClient(
      appelOutil({ ...DEMANDE_AGORA, salle: "grand-hall" }),
      brouillon("Bonjour,\n\nCette salle n'existe pas dans notre centre.\n\nLe support"),
    );

    const reponse = await proposerReponse(MESSAGE_LEA, TRI_NOUVELLE_RESERVATION, null, client, {
      maintenant: MAINTENANT,
    });

    expect(reponse.creneauxProposes).toEqual([]);
    const [resultat] = create.mock.calls[1][0].messages[2].content;
    expect(resultat).toMatchObject({ is_error: true, content: "Salle introuvable : grand-hall" });
  });

  it("s'arrête si le modèle appelle l'outil sans fin", async () => {
    agoraPriseLe24();
    const { client, create } = fauxClient(appelOutil(DEMANDE_AGORA));

    await expect(
      proposerReponse(MESSAGE_LEA, TRI_NOUVELLE_RESERVATION, null, client, { maintenant: MAINTENANT }),
    ).rejects.toThrow(/pas de réponse finale après 5 tours/);
    expect(create).toHaveBeenCalledTimes(5);
  });
});

describe("creneauxCites", () => {
  it("lit les écritures courantes d'un créneau et leur date", () => {
    expect(
      creneauxCites(
        "Le mardi 24 novembre de 14 h à 16 h, puis de 16h30 à 18h30.\n" +
          "Ou 9:00–11:00 le 1er décembre, ou entre 10 heures et 12 heures le 26/11.",
      ),
    ).toEqual([
      { jour: "11-24", debut: "14:00", fin: "16:00", cite: "de 14 h à 16 h" },
      { jour: "11-24", debut: "16:30", fin: "18:30", cite: "de 16h30 à 18h30" },
      { jour: "12-01", debut: "09:00", fin: "11:00", cite: "9:00–11:00" },
      { jour: "11-26", debut: "10:00", fin: "12:00", cite: "entre 10 heures et 12 heures" },
    ]);
  });

  it("ignore une heure seule, une durée et deux heures sans « entre »", () => {
    expect(
      creneauxCites("Le 24 novembre à 14 h, pour 2 h, à 14 h et 16 h, pour 8 personnes."),
    ).toEqual([]);
  });

  it("accepte toujours les horaires d'ouverture (R2)", async () => {
    const { client } = fauxClient(
      brouillon("Bonjour,\n\nLe centre est ouvert du lundi au vendredi de 8 h à 20 h.\n\nLe support"),
    );
    await expect(
      proposerReponse("Quels horaires ?", { ...TRI_QUESTION, categorie: "autre", reservationId: null }, null, client, {
        maintenant: MAINTENANT,
      }),
    ).resolves.toMatchObject({ statut: "BROUILLON" });
  });
});
