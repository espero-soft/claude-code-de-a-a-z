// Écran d'administration des tickets du support (/admin/tickets).
//
// Le projet n'a pas de connexion : l'administration n'existe qu'en
// développement. En production, la page répond 404 et la Server Action refuse
// d'agir (une action reste appelable directement, même si la page est en 404).
// Refus par défaut : seul NODE_ENV === "development" ouvre l'accès.
export function adminDisponible(env: string | undefined = process.env.NODE_ENV): boolean {
  return env === "development";
}

export type Urgence = "basse" | "normale" | "haute";
export type StatutTicket = "A_TRAITER" | "VALIDE";

const RANG_URGENCE: Record<Urgence, number> = { haute: 0, normale: 1, basse: 2 };
const RANG_STATUT: Record<StatutTicket, number> = { A_TRAITER: 0, VALIDE: 1 };

type TicketTriable = { urgence: Urgence; statut: StatutTicket; createdAt: Date };

// Ordre d'affichage : les plus urgents d'abord ; à urgence égale, ceux qui
// restent à traiter avant les validés, puis le plus ancien d'abord (celui qui
// attend depuis le plus longtemps). Ne modifie pas le tableau reçu.
export function ordonnerTickets<T extends TicketTriable>(tickets: readonly T[]): T[] {
  return [...tickets].sort(
    (a, b) =>
      RANG_URGENCE[a.urgence] - RANG_URGENCE[b.urgence] ||
      RANG_STATUT[a.statut] - RANG_STATUT[b.statut] ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
}
