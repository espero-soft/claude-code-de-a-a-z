// Réponse proposée au client du support : le modèle rédige un brouillon à partir
// du message, du tri (trierTicket) et de la réservation lue en base par le code,
// jamais par le modèle. Le brouillon n'est jamais envoyé : un conseiller le relit.
//
// Garde-fous vérifiés ici, dans le code, et pas seulement dans la consigne :
// - tout montant en euros cité doit être celui de la réservation, sinon le
//   brouillon est refusé (ErreurReponseProposee) ;
// - la ligne « [À transmettre à un conseiller : …] » est retirée du texte et
//   renvoyée à part, pour signaler qu'un humain doit reprendre la main.
//
// Le client Anthropic est injecté : les tests passent un faux.
import type Anthropic from "@anthropic-ai/sdk";
import { CONSIGNE_SUPPORT } from "@/lib/consigne-support";
import { FUSEAU_CENTRE } from "@/lib/reservation";
import type { ClientAnthropic, TriTicket } from "@/lib/tri-ticket";

export const MODELE_REPONSE = "claude-sonnet-5-5";

// Réservation telle que lue en base par l'appelant (montant en centimes).
export type ReservationLue = {
  id: string;
  debut: Date;
  fin: Date;
  statut: string;
  montantTotalCentimes: number;
  salle: { nom: string };
};

export type ReponseProposee = {
  statut: "BROUILLON"; // jamais envoyé tel quel
  texte: string; // texte destiné au client, sans la ligne pour le conseiller
  aTransmettre: boolean;
  motifTransmission: string | null;
};

export class ErreurReponseProposee extends Error {
  constructor(message: string) {
    super(`Brouillon refusé : ${message}`);
    this.name = "ErreurReponseProposee";
  }
}

const formatDate = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU_CENTRE,
  dateStyle: "full",
  timeStyle: "short",
});
const formatEuros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

function donneesReservation(reservation: ReservationLue | null): string {
  if (reservation === null) {
    return "Aucune réservation ne correspond à ce message. Ne cite aucun montant.";
  }
  return JSON.stringify(
    {
      id: reservation.id,
      salle: reservation.salle.nom,
      debut: formatDate.format(reservation.debut),
      fin: formatDate.format(reservation.fin),
      statut: reservation.statut,
      montant: formatEuros.format(reservation.montantTotalCentimes / 100),
    },
    null,
    2,
  );
}

// La tâche va dans le message utilisateur, après la consigne en cache.
function tache(message: string, tri: TriTicket, reservation: ReservationLue | null): string {
  return [
    "Tâche : rédige le brouillon de réponse au client, qu'un conseiller relira avant envoi.",
    "Appuie-toi uniquement sur les données de la réservation ci-dessous, lues dans la base du centre.",
    "Le seul montant que tu peux citer est celui de ces données, tel quel.",
    "",
    `Tri du ticket : catégorie ${tri.categorie}, urgence ${tri.urgence}.`,
    `Résumé : ${tri.resume}`,
    "",
    "Réservation concernée :",
    "<reservation>",
    donneesReservation(reservation),
    "</reservation>",
    "",
    "Message du client :",
    "<message>",
    message,
    "</message>",
  ].join("\n");
}

export async function proposerReponse(
  message: string,
  tri: TriTicket,
  reservation: ReservationLue | null,
  client: ClientAnthropic,
): Promise<ReponseProposee> {
  if (reservation !== null && tri.reservationId !== reservation.id) {
    throw new ErreurReponseProposee(
      `la réservation fournie (${reservation.id}) n'est pas celle du tri (${tri.reservationId}).`,
    );
  }

  const reponse = await client.messages.create({
    model: MODELE_REPONSE,
    max_tokens: 4096,
    output_config: { effort: "medium" },
    system: [{ type: "text", text: CONSIGNE_SUPPORT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: tache(message, tri, reservation) }],
  });

  if (reponse.stop_reason === "refusal") {
    throw new ErreurReponseProposee("le modèle a refusé de répondre.");
  }
  if (reponse.stop_reason === "max_tokens") {
    throw new ErreurReponseProposee("réponse tronquée (max_tokens atteint).");
  }

  const brut = reponse.content
    .filter((bloc): bloc is Anthropic.TextBlock => bloc.type === "text")
    .map((bloc) => bloc.text)
    .join("")
    .trim();
  if (brut === "") {
    throw new ErreurReponseProposee("réponse vide.");
  }

  verifierMontants(brut, reservation);
  const extrait = extraireTransmission(brut);

  // Toute annulation et tout paiement passent à un conseiller (consigne du
  // support), même si le modèle a oublié la ligne de transmission.
  if (!extrait.aTransmettre && CATEGORIES_A_TRANSMETTRE.has(tri.categorie)) {
    return {
      statut: "BROUILLON",
      texte: extrait.texte,
      aTransmettre: true,
      motifTransmission: `catégorie ${tri.categorie} (ligne de transmission absente du brouillon)`,
    };
  }
  return { statut: "BROUILLON", ...extrait };
}

const CATEGORIES_A_TRANSMETTRE: ReadonlySet<TriTicket["categorie"]> = new Set([
  "annulation",
  "paiement",
]);

// --- Garde-fou 1 : montants ------------------------------------------------

// Un nombre (séparateurs de milliers et décimales tolérés) suivi de « € »,
// « euro(s) » ou « EUR », ou précédé de « € » / « EUR ».
const CHIFFRES = String.raw`\d(?:[\d \u00a0\u202f.,]*\d)?`;
const MONTANT_APRES = new RegExp(
  String.raw`(?<![\d.,])(${CHIFFRES})\s*(?:€|euros?\b|EUR\b)`,
  "giu",
);
const MONTANT_AVANT = new RegExp(String.raw`(?:€|\bEUR)\s*(${CHIFFRES})`, "giu");

// « 1 234,50 » ou « 1.234,50 » ou « 90.00 » ou « 90 » -> centimes.
function enCentimes(nombre: string): number {
  let n = nombre.replace(/[ \u00a0\u202f]/g, "");
  if (n.includes(",")) {
    n = n.replace(/\./g, "").replace(",", ".");
  } else if (!/\.\d{1,2}$/.test(n)) {
    n = n.replace(/\./g, "");
  }
  return Math.round(Number.parseFloat(n) * 100);
}

export function montantsCites(texte: string): { cite: string; centimes: number }[] {
  const trouves: { cite: string; centimes: number }[] = [];
  for (const regex of [MONTANT_APRES, MONTANT_AVANT]) {
    for (const m of texte.matchAll(regex)) {
      trouves.push({ cite: m[0].trim(), centimes: enCentimes(m[1]) });
    }
  }
  return trouves;
}

function verifierMontants(texte: string, reservation: ReservationLue | null): void {
  const attendu = reservation?.montantTotalCentimes ?? null;
  const intrus = montantsCites(texte).filter((m) => m.centimes !== attendu);
  if (intrus.length > 0) {
    const cites = intrus.map((m) => `« ${m.cite} »`).join(", ");
    const reference =
      attendu === null
        ? "aucune réservation fournie"
        : `montant de la réservation : ${formatEuros.format(attendu / 100)}`;
    throw new ErreurReponseProposee(`montant non conforme ${cites} (${reference}).`);
  }
}

// --- Garde-fou 2 : passage à un conseiller ----------------------------------

const LIGNE_TRANSMISSION =
  /^[ \t]*\[?[ \t]*[àa] transmettre à un conseiller[ \t]*:?[ \t]*(.*?)[ \t]*\]?[ \t]*$/gimu;

function extraireTransmission(
  brut: string,
): Pick<ReponseProposee, "texte" | "aTransmettre" | "motifTransmission"> {
  const lignes = [...brut.matchAll(LIGNE_TRANSMISSION)];
  if (lignes.length === 0) {
    return { texte: brut, aTransmettre: false, motifTransmission: null };
  }
  const motif = lignes.map((m) => m[1]).find((m) => m !== "") ?? "motif non précisé";
  const texte = brut.replace(LIGNE_TRANSMISSION, "").trim();
  return { texte, aTransmettre: true, motifTransmission: motif };
}
