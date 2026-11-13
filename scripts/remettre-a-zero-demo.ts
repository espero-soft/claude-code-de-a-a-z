// Remise à zéro de la démonstration publique : réservations et comptes
// clients effacés ; salles, personnel et journal gardés
// (remettreAZeroDemo, src/lib/remise-a-zero-demo.ts).
//
// Lancé chaque nuit sur le serveur par deploiement/reunea-remise-a-zero.timer,
// après une sauvegarde de la base. À la main :
//   npm run demo:remettre-a-zero -- --confirmer
// Sans --confirmer, n'efface rien : une base de développement ne se vide pas
// par erreur.
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { remettreAZeroDemo } from "../src/lib/remise-a-zero-demo";

async function main(): Promise<number> {
  if (!process.argv.includes("--confirmer")) {
    console.error(
      "Rien n'a été effacé. Cette commande efface toutes les réservations et les comptes clients.\n" +
        "Pour confirmer : npm run demo:remettre-a-zero -- --confirmer",
    );
    return 1;
  }
  const bilan = await remettreAZeroDemo(prisma);
  console.log(
    `Démonstration remise à zéro : ${bilan.reservations} réservation(s), ` +
      `${bilan.comptes} compte(s) client, ${bilan.tickets} ticket(s) effacés. ` +
      "Salles, personnel et journal des connexions gardés.",
  );
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((erreur) => {
    console.error("Remise à zéro en échec, rien n'a été effacé (transaction) :", erreur);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
