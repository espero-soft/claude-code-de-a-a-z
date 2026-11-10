// Réponse proposée au client du support : le modèle rédige un brouillon à partir
// du message, du tri (trierTicket) et de la réservation lue en base par le code,
// jamais par le modèle. Le brouillon n'est jamais envoyé : un conseiller le relit.
//
// Garde-fous vérifiés ici, dans le code, et pas seulement dans la consigne :
// - tout montant en euros cité doit être celui de la réservation, sinon le
//   brouillon est refusé (ErreurReponseProposee) ;
// - tout créneau cité (heure de début et heure de fin) doit venir des résultats
//   de l'outil proposer_creneau_libre, du message du client ou de la
//   réservation lue en base, sinon le brouillon est refusé ;
// - la ligne « [À transmettre à un conseiller : …] » est retirée du texte et
//   renvoyée à part, pour signaler qu'un humain doit reprendre la main.
//
// L'outil proposer_creneau_libre (lecture seule) n'est proposé au modèle que
// pour un ticket trié « reservation » ; la tâche précise qu'il ne s'en sert que
// pour une demande de réservation ou de changement de créneau.
//
// Le client Anthropic est injecté : les tests passent un faux.
import type Anthropic from "@anthropic-ai/sdk";
import { CONSIGNE_SUPPORT } from "@/lib/consigne-support";
import {
  OUTIL_PROPOSER_CRENEAU,
  executerOutilProposer,
  type CreneauPropose,
} from "@/lib/outil-proposer-creneau";
import { FUSEAU_CENTRE } from "@/lib/reservation";
import type { ClientAnthropic, TriTicket } from "@/lib/tri-ticket";

export const MODELE_REPONSE = "claude-sonnet-5-5";
const TOURS_MAX = 5; // garde-fou : pas de boucle infinie si le modèle insiste

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
  creneauxProposes: CreneauPropose[]; // résultats de l'outil, pour le conseiller
};

export type OptionsReponse = {
  maintenant?: Date; // injecté par les tests ; heure réelle sinon
  // Appelé après chaque appel d'outil (affichage dans les scripts).
  surAppelOutil?: (bloc: Anthropic.ToolUseBlock, resultat: Anthropic.ToolResultBlockParam) => void;
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

const formatAujourdhui = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU_CENTRE,
  dateStyle: "full",
  timeStyle: "short",
});

// Consignes propres à l'outil, ajoutées seulement quand il est proposé.
const CONSIGNES_OUTIL = [
  "Outil proposer_creneau_libre : utilise-le uniquement si le client demande à réserver une salle",
  "ou à changer le créneau d'une réservation ; pour toute autre demande, ne l'utilise pas.",
  "Passe-lui la salle (atelier, horizon, agora ou conseil), la date (AAAA-MM-JJ), l'heure de début",
  "et la durée demandées par le client.",
  "- Si le créneau demandé est libre, dis qu'il l'est à ce jour, sans le garantir : seule une réservation",
  "  payée bloque un créneau, le client doit donc réserver puis payer sur le site.",
  "- Sinon, explique pourquoi en reprenant le motif renvoyé, puis propose les créneaux renvoyés, tels quels.",
  "- Ne cite aucun autre créneau que ceux renvoyés par l'outil, ceux du message du client et celui de la",
  "  réservation ci-dessous. Écris chaque créneau avec sa date, sous la forme « le jeudi 26 novembre de 9 h à 11 h ».",
  "- Tu ne réserves rien et tu ne modifies rien : un changement de créneau d'une réservation confirmée",
  "  reste transmis à un conseiller, comme le prévoit la consigne.",
];

// La tâche va dans le message utilisateur, après la consigne en cache (la date
// du jour aussi : la consigne reste figée).
function tache(
  message: string,
  tri: TriTicket,
  reservation: ReservationLue | null,
  avecOutil: boolean,
  maintenant: Date,
): string {
  return [
    "Tâche : rédige le brouillon de réponse au client, qu'un conseiller relira avant envoi.",
    "Appuie-toi uniquement sur les données de la réservation ci-dessous, lues dans la base du centre.",
    "Le seul montant que tu peux citer est celui de ces données, tel quel.",
    `Nous sommes le ${formatAujourdhui.format(maintenant)} (heure de Paris).`,
    ...(avecOutil ? ["", ...CONSIGNES_OUTIL] : []),
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
  options: OptionsReponse = {},
): Promise<ReponseProposee> {
  if (reservation !== null && tri.reservationId !== reservation.id) {
    throw new ErreurReponseProposee(
      `la réservation fournie (${reservation.id}) n'est pas celle du tri (${tri.reservationId}).`,
    );
  }

  const maintenant = options.maintenant ?? new Date();
  // Garde-fou dans le code : l'outil n'est même pas proposé hors réservation.
  const avecOutil = tri.categorie === "reservation";
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: tache(message, tri, reservation, avecOutil, maintenant) },
  ];
  // Créneaux renvoyés par l'outil : les seuls nouveaux créneaux citables.
  const creneauxProposes: CreneauPropose[] = [];

  for (let tour = 1; tour <= TOURS_MAX; tour++) {
    const reponse = await client.messages.create({
      model: MODELE_REPONSE,
      max_tokens: 4096,
      output_config: { effort: "medium" },
      system: [{ type: "text", text: CONSIGNE_SUPPORT, cache_control: { type: "ephemeral" } }],
      ...(avecOutil ? { tools: [OUTIL_PROPOSER_CRENEAU] } : {}),
      messages: [...messages], // copie : la conversation continue après cet appel
    });

    if (reponse.stop_reason === "refusal") {
      throw new ErreurReponseProposee("le modèle a refusé de répondre.");
    }
    if (reponse.stop_reason === "max_tokens") {
      throw new ErreurReponseProposee("réponse tronquée (max_tokens atteint).");
    }

    if (reponse.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: reponse.content });
      const appels = reponse.content.filter(
        (bloc): bloc is Anthropic.ToolUseBlock => bloc.type === "tool_use",
      );
      const executions = await Promise.all(
        appels.map((bloc) => executerOutilProposer(bloc, maintenant)),
      );
      executions.forEach(({ resultat, proposition }, i) => {
        options.surAppelOutil?.(appels[i], resultat);
        if (proposition) creneauxProposes.push(...proposition.creneaux);
      });
      messages.push({ role: "user", content: executions.map((e) => e.resultat) });
      continue;
    }

    return finaliser(reponse, message, tri, reservation, creneauxProposes);
  }

  throw new ErreurReponseProposee(`pas de réponse finale après ${TOURS_MAX} tours.`);
}

function finaliser(
  reponse: Anthropic.Message,
  message: string,
  tri: TriTicket,
  reservation: ReservationLue | null,
  creneauxProposes: CreneauPropose[],
): ReponseProposee {
  const brut = reponse.content
    .filter((bloc): bloc is Anthropic.TextBlock => bloc.type === "text")
    .map((bloc) => bloc.text)
    .join("")
    .trim();
  if (brut === "") {
    throw new ErreurReponseProposee("réponse vide.");
  }

  verifierMontants(brut, reservation);
  verifierCreneaux(brut, creneauxAutorises(message, reservation, creneauxProposes));
  const extrait = extraireTransmission(brut);

  // Toute annulation et tout paiement passent à un conseiller (consigne du
  // support), même si le modèle a oublié la ligne de transmission.
  if (!extrait.aTransmettre && CATEGORIES_A_TRANSMETTRE.has(tri.categorie)) {
    return {
      statut: "BROUILLON",
      texte: extrait.texte,
      aTransmettre: true,
      motifTransmission: `catégorie ${tri.categorie} (ligne de transmission absente du brouillon)`,
      creneauxProposes,
    };
  }
  return { statut: "BROUILLON", ...extrait, creneauxProposes };
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

// --- Garde-fou 2 : créneaux --------------------------------------------------

// Un créneau cité : jour « MM-JJ » (null si le texte n'en donne aucun) et heures
// « HH:MM ». L'année n'est pas lue : l'outil cherche sur deux semaines.
export type CreneauCite = { jour: string | null; debut: string; fin: string; cite: string };

const JOURS_SEMAINE = "lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche";
const NOMS_MOIS = [
  "janvier", "fevrier", "mars", "avril", "mai", "juin",
  "juillet", "aout", "septembre", "octobre", "novembre", "decembre",
];
// « mardi 24 novembre », « 1er décembre 2026 », « 24/11 », « 24/11/2026 ».
const DATE_CITEE = new RegExp(
  String.raw`(?:\b(?:${JOURS_SEMAINE})\s+)?\b(1er|\d{1,2})\s+` +
    String.raw`(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\b` +
    String.raw`(?:\s+\d{4})?|\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b`,
  "giu",
);
// « 14 h », « 14h30 », « 14 h 30 », « 14 heures », « 14:30 ».
const HEURE = String.raw`(\d{1,2})\s*(?:h(?:eures?)?(?:\s*(\d{2}))?|:(\d{2}))(?!\d)`;
// « de 14 h à 16 h », « 14 h - 16 h », « 14:00–16:00 », « entre 14 h et 16 h ».
const PLAGE = new RegExp(
  String.raw`(?<![\d:])(?:(?:\b(entre)|\bde)\s+)?${HEURE}\s*(à|-|–|—|et)\s*${HEURE}`,
  "giu",
);

const deuxChiffres = (n: number) => String(n).padStart(2, "0");

function enHeureCitee(h: string, m1?: string, m2?: string): string | null {
  const heures = Number(h);
  const minutes = Number(m1 ?? m2 ?? "0");
  if (heures > 24 || minutes > 59) return null;
  return `${deuxChiffres(heures)}:${deuxChiffres(minutes)}`;
}

function datesCitees(texte: string): { debut: number; fin: number; jour: string }[] {
  const dates: { debut: number; fin: number; jour: string }[] = [];
  for (const m of texte.matchAll(DATE_CITEE)) {
    let jour: number;
    let mois: number;
    if (m[1] !== undefined) {
      jour = m[1] === "1er" ? 1 : Number(m[1]);
      const nom = m[2].normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
      mois = NOMS_MOIS.indexOf(nom) + 1;
    } else {
      jour = Number(m[3]);
      mois = Number(m[4]);
    }
    if (jour < 1 || jour > 31 || mois < 1 || mois > 12) continue;
    dates.push({
      debut: m.index,
      fin: m.index + m[0].length,
      jour: `${deuxChiffres(mois)}-${deuxChiffres(jour)}`,
    });
  }
  return dates;
}

// Chaque plage horaire du texte, avec sa date : celle écrite juste après sur la
// même ligne (« de 9 h à 11 h le jeudi 26 novembre »), sinon la dernière date
// écrite avant (« le jeudi 26 novembre de 9 h à 11 h », « le même jour de… »).
export function creneauxCites(texte: string): CreneauCite[] {
  const dates = datesCitees(texte);
  const cites: CreneauCite[] = [];
  for (const m of texte.matchAll(PLAGE)) {
    const [cite, entre, h1, m1a, m1b, separateur, h2, m2a, m2b] = m;
    if (separateur === "et" && entre === undefined) continue; // « 14 h et 16 h » : deux heures
    const debut = enHeureCitee(h1, m1a, m1b);
    const fin = enHeureCitee(h2, m2a, m2b);
    if (debut === null || fin === null) continue;
    const finPlage = m.index + cite.length;
    const apres = dates.find(
      (d) => d.debut >= finPlage && /^[ \t]*,?[ \t]*(?:le[ \t]+)?$/iu.test(texte.slice(finPlage, d.debut)),
    );
    const avant = dates.filter((d) => d.fin <= m.index).at(-1);
    cites.push({ jour: (apres ?? avant)?.jour ?? null, debut, fin, cite: cite.trim() });
  }
  return cites;
}

const formatJourParis = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSEAU_CENTRE,
  month: "2-digit",
  day: "2-digit",
});
const formatHeureParis = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU_CENTRE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type CreneauAutorise = Omit<CreneauCite, "cite">;

// Créneaux qu'un brouillon peut citer : ceux renvoyés par l'outil, ceux que le
// client a lui-même écrits (pour reprendre sa demande), celui de la réservation
// lue en base, et les horaires d'ouverture (R2), sans date.
function creneauxAutorises(
  message: string,
  reservation: ReservationLue | null,
  proposes: readonly CreneauPropose[],
): CreneauAutorise[] {
  const autorises: CreneauAutorise[] = [{ jour: null, debut: "08:00", fin: "20:00" }];
  if (reservation !== null) {
    autorises.push({
      jour: formatJourParis.format(reservation.debut),
      debut: formatHeureParis.format(reservation.debut),
      fin: formatHeureParis.format(reservation.fin),
    });
  }
  autorises.push(...creneauxCites(message));
  for (const c of proposes) {
    autorises.push({ jour: c.date.slice(5), debut: c.heureDebut, fin: c.heureFin });
  }
  return autorises;
}

function verifierCreneaux(texte: string, autorises: readonly CreneauAutorise[]): void {
  const intrus = creneauxCites(texte).filter(
    (c) =>
      !autorises.some(
        (a) =>
          a.debut === c.debut &&
          a.fin === c.fin &&
          (a.jour === null || c.jour === null || a.jour === c.jour),
      ),
  );
  if (intrus.length > 0) {
    const cites = intrus
      .map((c) => `« ${c.cite} »${c.jour ? ` (${c.jour.split("-").reverse().join("/")})` : ""}`)
      .join(", ");
    throw new ErreurReponseProposee(
      `créneau non proposé par l'outil ${cites} : un brouillon ne cite que les créneaux ` +
        "renvoyés par proposer_creneau_libre, ceux du client et celui de la réservation.",
    );
  }
}

// --- Garde-fou 3 : passage à un conseiller ----------------------------------

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
