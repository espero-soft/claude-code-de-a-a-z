// Date de la réservation de démonstration (seed et test navigateur) : le mardi
// qui suit d'au moins 7 jours la date du jour, au format AAAA-MM-JJ. Une date
// écrite en dur finirait dans le passé, et R4 refuserait alors le parcours.
export function dateDemo(aujourdhui: Date = new Date()): string {
  const d = new Date(Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth(), aujourdhui.getUTCDate() + 7));
  while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
