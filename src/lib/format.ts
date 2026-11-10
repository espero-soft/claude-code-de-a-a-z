// Formateur de prix partagé (plan de refonte : « toujours deux décimales,
// un seul formateur »). Les montants restent en centimes entiers partout ;
// la division par 100 n'a lieu qu'ici, à l'affichage.
const formatEuros = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// 2500 -> « 25,00 € » (espaces insécables, comme le veut l'usage français).
export function formaterPrix(centimes: number): string {
  return formatEuros.format(centimes / 100);
}
