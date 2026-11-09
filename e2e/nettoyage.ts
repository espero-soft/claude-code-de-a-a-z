// Supprime de dev.db les réservations créées par les tests navigateur
// (reconnues à leur e-mail). Lancé par tsx depuis les tests : le client Prisma
// généré est un module ESM, que le chargeur de Playwright ne sait pas importer.
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

// Même adresse que dans les tests (*.spec.ts).
const EMAIL_TEST = "playwright@example.com";

async function main() {
  await prisma.reservation.deleteMany({ where: { emailClient: EMAIL_TEST } });
}

main().finally(() => prisma.$disconnect());
