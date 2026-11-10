// Mini agent de tri des messages du support. Le modèle reçoit la consigne du
// support (en cache) et l'outil chercher_reservation ; il renvoie un tri validé :
// catégorie, urgence, réservation concernée et résumé.
//
// Le client Anthropic est injecté : les tests passent un faux, sans jamais
// appeler l'API.
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CONSIGNE_SUPPORT } from "@/lib/consigne-support";
import {
  OUTIL_CHERCHER_RESERVATION,
  executerOutilChercher,
} from "@/lib/outil-chercher-reservation";

export const MODELE_TRI = "claude-haiku-5-5";
const TOURS_MAX = 5; // garde-fou : pas de boucle infinie si le modèle insiste

export const TriTicket = z.object({
  categorie: z.enum(["reservation", "paiement", "annulation", "autre"]),
  urgence: z.enum(["basse", "normale", "haute"]),
  reservationId: z.string().nullable(),
  resume: z.string().min(1),
});
export type TriTicket = z.infer<typeof TriTicket>;

// Seul ce dont trierTicket a besoin : un vrai client Anthropic convient, un faux aussi.
export type ClientAnthropic = {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): PromiseLike<Anthropic.Message>;
  };
};

export class ErreurTriTicket extends Error {
  constructor(message: string) {
    super(`Tri du ticket impossible : ${message}`);
    this.name = "ErreurTriTicket";
  }
}

// La tâche est placée dans le message utilisateur, après la consigne en cache :
// la consigne reste identique d'un appel à l'autre et le cache tient.
function tache(message: string, email: string): string {
  return [
    "Tâche : ne rédige pas de réponse au client. Trie son message.",
    "Utilise d'abord l'outil chercher_reservation avec son e-mail, puis identifie la réservation dont parle le message.",
    "Renvoie :",
    "- categorie : reservation, paiement, annulation ou autre ;",
    "- urgence : basse, normale ou haute ;",
    "- reservationId : l'identifiant exact renvoyé par l'outil, ou null si aucune réservation ne correspond ;",
    "- resume : le message résumé en une phrase, en français.",
    "",
    `E-mail du client : ${email}`,
    "Message du client :",
    "<message>",
    message,
    "</message>",
  ].join("\n");
}

export async function trierTicket(
  message: string,
  email: string,
  client: ClientAnthropic,
): Promise<TriTicket> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: tache(message, email) },
  ];
  // Identifiants renvoyés par l'outil : le modèle ne peut pas en inventer un.
  const idsConnus = new Set<string>();

  for (let tour = 1; tour <= TOURS_MAX; tour++) {
    const reponse = await client.messages.create({
      model: MODELE_TRI,
      max_tokens: 2048,
      output_config: { effort: "low", format: zodOutputFormat(TriTicket) },
      system: [
        { type: "text", text: CONSIGNE_SUPPORT, cache_control: { type: "ephemeral" } },
      ],
      tools: [OUTIL_CHERCHER_RESERVATION],
      messages,
    });

    if (reponse.stop_reason === "refusal") {
      throw new ErreurTriTicket("le modèle a refusé de répondre.");
    }
    if (reponse.stop_reason === "max_tokens") {
      throw new ErreurTriTicket("réponse tronquée (max_tokens atteint).");
    }

    if (reponse.stop_reason === "tool_use") {
      // Réponse complète rendue au modèle, puis tous les résultats d'outils
      // dans un seul message utilisateur.
      messages.push({ role: "assistant", content: reponse.content });
      const appels = reponse.content.filter(
        (bloc): bloc is Anthropic.ToolUseBlock => bloc.type === "tool_use",
      );
      const executions = await Promise.all(appels.map(executerOutilChercher));
      for (const { reservations } of executions) {
        for (const r of reservations) idsConnus.add(r.id);
      }
      messages.push({ role: "user", content: executions.map((e) => e.resultat) });
      continue;
    }

    return valider(reponse, idsConnus);
  }

  throw new ErreurTriTicket(`pas de réponse finale après ${TOURS_MAX} tours.`);
}

function valider(reponse: Anthropic.Message, idsConnus: Set<string>): TriTicket {
  const texte = reponse.content
    .filter((bloc): bloc is Anthropic.TextBlock => bloc.type === "text")
    .map((bloc) => bloc.text)
    .join("")
    .trim();

  let json: unknown;
  try {
    json = JSON.parse(texte);
  } catch {
    throw new ErreurTriTicket(`la réponse du modèle n'est pas du JSON : ${texte.slice(0, 200)}`);
  }

  const resultat = TriTicket.safeParse(json);
  if (!resultat.success) {
    const details = resultat.error.issues
      .map((i) => `${i.path.join(".") || "(racine)"} : ${i.message}`)
      .join(" ; ");
    throw new ErreurTriTicket(`réponse du modèle hors format (${details}).`);
  }

  const tri = resultat.data;
  if (tri.reservationId !== null && !idsConnus.has(tri.reservationId)) {
    throw new ErreurTriTicket(
      `réservation ${tri.reservationId} inconnue (absente des résultats de chercher_reservation).`,
    );
  }
  return tri;
}
