// Supprime de dev.db les réservations, les tickets et le compte créés par les tests
// navigateur (reconnus à leur e-mail). Lancé par tsx depuis les tests : le
// client Prisma généré est un module ESM, que le chargeur de Playwright ne sait
// pas importer.
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

// Même adresse que dans les tests (*.spec.ts).
const EMAIL_TEST = "playwright@example.com";
// Adresses jetables de e2e/attaques-connexion.spec.ts.
const DOMAINE_ATTAQUES = "@attaque.example.com";

async function main() {
  // Limite par adresse (envois et essais de code) : sans ce ménage, relancer
  // les tests de connexion dans le quart d'heure dépasserait la limite.
  await prisma.limiteConnexion.deleteMany({
    where: { OR: [{ cle: { endsWith: `:${EMAIL_TEST}` } }, { cle: { endsWith: DOMAINE_ATTAQUES } }] },
  });
  await prisma.session.deleteMany({ where: { user: { email: { endsWith: DOMAINE_ATTAQUES } } } });
  await prisma.account.deleteMany({ where: { user: { email: { endsWith: DOMAINE_ATTAQUES } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAINE_ATTAQUES } } });
  await prisma.verification.deleteMany({ where: { identifier: { endsWith: DOMAINE_ATTAQUES } } });

  await prisma.ticket.deleteMany({ where: { email: EMAIL_TEST } });
  await prisma.reservation.deleteMany({ where: { emailClient: EMAIL_TEST } });
  // Compte créé par e2e/connexion.spec.ts, ses sessions et ses codes en cours.
  await prisma.session.deleteMany({ where: { user: { email: EMAIL_TEST } } });
  await prisma.account.deleteMany({ where: { user: { email: EMAIL_TEST } } });
  await prisma.user.deleteMany({ where: { email: EMAIL_TEST } });
  await prisma.verification.deleteMany({ where: { identifier: { contains: EMAIL_TEST } } });
}

main().finally(() => prisma.$disconnect());
