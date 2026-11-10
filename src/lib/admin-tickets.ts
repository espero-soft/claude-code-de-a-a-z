// Écran d'administration des tickets du support (/admin/tickets). L'accès
// (employé et administrateur) est contrôlé par src/lib/acces.ts et les règles
// de src/lib/roles.ts.

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
