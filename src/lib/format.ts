import { FUSEAU_CENTRE } from "@/lib/reservation";

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

// Heures du centre (Europe/Paris), quel que soit le fuseau du serveur.
const formatHeureParis = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU_CENTRE,
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});

// Heure du centre écrite « 10 h » ou « 10 h 30 » (charte : pas de « 10:00 »).
export function formaterHeure(date: Date): string {
  const parties = formatHeureParis.formatToParts(date);
  const heure = Number(parties.find((p) => p.type === "hour")?.value);
  const minute = parties.find((p) => p.type === "minute")?.value ?? "00";
  return minute === "00" ? `${heure} h` : `${heure} h ${minute}`;
}

// Plage « de 14 h à 15 h 30 », sans tiret (charte).
export function formaterPlage(debut: Date, fin: Date): string {
  return `de ${formaterHeure(debut)} à ${formaterHeure(fin)}`;
}

// Durée « 1 h », « 1 h 30 », « 30 min ».
export function formaterDuree(minutes: number): string {
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  if (heures === 0) return `${reste} min`;
  return reste === 0 ? `${heures} h` : `${heures} h ${String(reste).padStart(2, "0")}`;
}
