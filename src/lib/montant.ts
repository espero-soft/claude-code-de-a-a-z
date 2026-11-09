const MS_PAR_HEURE = 60 * 60 * 1000;

// Règle R5 du cahier des charges : montant = prix par heure × durée.
// Les montants restent en centimes entiers, comme en base : on arrondit
// au centime le plus proche quand la durée n'est pas un nombre rond d'heures.
export function calculerMontant(
  prixParHeureCentimes: number,
  debut: Date,
  fin: Date,
): number {
  const dureeMs = fin.getTime() - debut.getTime();
  if (dureeMs <= 0) {
    throw new Error("La fin doit être postérieure au début.");
  }
  return Math.round((prixParHeureCentimes * dureeMs) / MS_PAR_HEURE);
}
