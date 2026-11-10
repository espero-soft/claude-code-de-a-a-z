// Fait « passer le temps » pour une adresse, sans attendre, dans les tests
// d'attaque de la connexion (e2e/attaques-connexion.spec.ts) :
//   npx tsx e2e/vieillir-connexion.ts <e-mail> code    -> le code en cours a expiré
//   npx tsx e2e/vieillir-connexion.ts <e-mail> envois  -> la fenêtre des envois est écoulée
// Lancé par tsx, comme nettoyage.ts : le client Prisma généré est un module
// ESM, que le chargeur de Playwright ne sait pas importer.
import "dotenv/config";
import { cleLimite, LIMITE_ENVOIS } from "../src/lib/limite-connexion";
import { prisma } from "../src/lib/prisma";

async function main() {
  const [email, quoi] = process.argv.slice(2);
  if (!email?.endsWith("@attaque.example.com")) {
    throw new Error("Réservé aux adresses de test @attaque.example.com.");
  }
  const ilYAUneMinute = new Date(Date.now() - 60_000);
  if (quoi === "code") {
    await prisma.verification.updateMany({
      where: { identifier: `sign-in-otp-${email}` },
      data: { expiresAt: ilYAUneMinute },
    });
  } else if (quoi === "envois") {
    await prisma.limiteConnexion.updateMany({
      where: { cle: cleLimite("envoi", email) },
      data: { debut: new Date(ilYAUneMinute.getTime() - LIMITE_ENVOIS.fenetreMs) },
    });
  } else {
    throw new Error(`Inconnu : « ${quoi} » (attendu : code ou envois).`);
  }
}

main().finally(() => prisma.$disconnect());
