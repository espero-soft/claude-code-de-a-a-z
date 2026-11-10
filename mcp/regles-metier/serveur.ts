// Serveur MCP « regles-metier » : expose l'outil verifier_creneau.
// La recherche de salle et l'horloge sont injectées, pour tester sans base.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { verifierCreneau } from "./verifier-creneau";

export type SalleTrouvee = { slug: string; nom: string };

export type DependancesServeur = {
  // Salle active correspondant au slug ou à l'identifiant, sinon null.
  chercherSalle: (salle: string) => Promise<SalleTrouvee | null>;
  maintenant?: () => Date;
};

const schemaErreur = z.object({
  champ: z.enum(["salle", "date", "heureDebut", "heureFin"]),
  regle: z.enum(["R1", "R2", "R4"]).nullable(),
  message: z.string(),
});

export function creerServeur({
  chercherSalle,
  maintenant = () => new Date(),
}: DependancesServeur): McpServer {
  const serveur = new McpServer({ name: "regles-metier", version: "1.0.0" });

  serveur.registerTool(
    "verifier_creneau",
    {
      title: "Vérifier un créneau",
      description:
        "Indique si un créneau de réservation respecte les règles du cahier des charges " +
        "R1 (au moins 1 h, par tranches de 30 min), R2 (lundi au vendredi, 8 h à 20 h) " +
        "et R4 (pas dans le passé). Heures de Paris. Ne vérifie pas R3 (chevauchement).",
      inputSchema: {
        salle: z.string().describe("Slug (ex. « horizon ») ou identifiant de la salle"),
        date: z.string().describe("Date au format AAAA-MM-JJ"),
        heureDebut: z.string().describe("Heure de début au format HH:MM, heure de Paris"),
        heureFin: z.string().describe("Heure de fin au format HH:MM, heure de Paris"),
      },
      outputSchema: {
        respecte: z.boolean(),
        salle: z.object({ slug: z.string(), nom: z.string() }).nullable(),
        erreurs: z.array(schemaErreur),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ salle, date, heureDebut, heureFin }) => {
      const salleTrouvee = await chercherSalle(salle);
      const verdict = verifierCreneau({ date, heureDebut, heureFin }, maintenant());
      const erreurs = [
        ...(salleTrouvee
          ? []
          : [{ champ: "salle" as const, regle: null, message: `Salle introuvable : « ${salle} ».` }]),
        ...verdict.erreurs,
      ];
      const resultat = {
        respecte: salleTrouvee !== null && verdict.respecte,
        salle: salleTrouvee,
        erreurs,
      };

      const texte = resultat.respecte
        ? `Créneau valide (R1, R2, R4) : ${salleTrouvee!.nom}, le ${date} de ${heureDebut} à ${heureFin}.`
        : "Créneau refusé :\n" +
          erreurs.map((e) => `- ${e.regle ?? "saisie"} (${e.champ}) : ${e.message}`).join("\n");

      return { content: [{ type: "text", text: texte }], structuredContent: resultat };
    },
  );

  return serveur;
}
