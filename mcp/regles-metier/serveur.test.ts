// Teste le serveur à travers le protocole MCP (client et serveur reliés en
// mémoire), avec une salle et une horloge simulées : ni base ni processus.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { creerServeur } from "./serveur";

// Lundi 9 novembre 2026, 10 h à Paris.
const MAINTENANT = new Date("2026-11-09T09:00:00Z");
const HORIZON = { slug: "horizon", nom: "Horizon" };

let client: Client;

beforeEach(async () => {
  const serveur = creerServeur({
    chercherSalle: async (salle) => (salle === "horizon" ? HORIZON : null),
    maintenant: () => MAINTENANT,
  });
  const [cote1, cote2] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([serveur.connect(cote1), client.connect(cote2)]);
});

afterEach(() => client.close());

function verifier(args: Record<string, string>) {
  return client.callTool({
    name: "verifier_creneau",
    arguments: { salle: "horizon", date: "2026-11-10", heureDebut: "09:00", heureFin: "11:00", ...args },
  });
}

describe("serveur MCP regles-metier", () => {
  it("expose l'outil verifier_creneau, en lecture seule", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["verifier_creneau"]);
    expect(tools[0].inputSchema.required).toEqual(["salle", "date", "heureDebut", "heureFin"]);
    expect(tools[0].annotations?.readOnlyHint).toBe(true);
  });

  it("valide un créneau correct", async () => {
    const resultat = await verifier({});
    expect(resultat.structuredContent).toEqual({ respecte: true, salle: HORIZON, erreurs: [] });
    expect(resultat.content).toEqual([
      { type: "text", text: "Créneau valide (R1, R2, R4) : Horizon, le 2026-11-10 de 09:00 à 11:00." },
    ]);
  });

  it("refuse un créneau et cite la règle en cause", async () => {
    const resultat = await verifier({ date: "2026-11-14" });
    expect(resultat.structuredContent).toMatchObject({
      respecte: false,
      erreurs: [{ champ: "date", regle: "R2", message: "Le centre est ouvert du lundi au vendredi." }],
    });
    expect(resultat.content).toEqual([
      { type: "text", text: "Créneau refusé :\n- R2 (date) : Le centre est ouvert du lundi au vendredi." },
    ]);
  });

  it("refuse une salle inconnue tout en vérifiant le créneau", async () => {
    const resultat = await verifier({ salle: "inconnue", heureFin: "09:30" });
    expect(resultat.structuredContent).toEqual({
      respecte: false,
      salle: null,
      erreurs: [
        { champ: "salle", regle: null, message: "Salle introuvable : « inconnue »." },
        { champ: "heureFin", regle: "R1", message: "Une réservation dure au moins 1 heure." },
      ],
    });
  });

  it("rejette un appel sans argument obligatoire", async () => {
    const resultat = await client.callTool({ name: "verifier_creneau", arguments: { salle: "horizon" } });
    expect(resultat.isError).toBe(true);
  });
});
