// Supprime de dev.db les réservations, les tickets et le compte créés par les tests
// navigateur (reconnus à leur e-mail). Lancé par tsx depuis les tests : le
// client Prisma généré est un module ESM, que le chargeur de Playwright ne sait
// pas importer.
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

// Même adresse que dans les tests (*.spec.ts).
const EMAIL_TEST = "playwright@example.com";

async function main() {
  await prisma.ticket.deleteMany({ where: { email: EMAIL_TEST } });
  await prisma.reservation.deleteMany({ where: { emailClient: EMAIL_TEST } });
  // Compte créé par e2e/connexion.spec.ts, ses sessions et ses codes en cours.
  await prisma.session.deleteMany({ where: { user: { email: EMAIL_TEST } } });
  await prisma.account.deleteMany({ where: { user: { email: EMAIL_TEST } } });
  await prisma.user.deleteMany({ where: { email: EMAIL_TEST } });
  await prisma.verification.deleteMany({ where: { identifier: { contains: EMAIL_TEST } } });
}

main().finally(() => prisma.$disconnect());
