// Données de e2e/profil.spec.ts, dans dev.db. Lancé par tsx (le client
// Prisma généré est un module ESM, que le chargeur de Playwright ne sait pas
// importer). Adresses @roles.example.com, supprimées par e2e/nettoyage.ts.
//
//   npx tsx e2e/profil-exemple.ts preparer
//     crée le compte de Paul (client, adresse vérifiée, sans nom) avec une
//     réservation payée et une jamais payée ; écrit leurs identifiants.
//   npx tsx e2e/profil-exemple.ts etat <id payée> <id jamais payée>
//     écrit ce qui reste en base : compte, sessions, réservations.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { dateDemo } from "../src/lib/date-demo";
import { prisma } from "../src/lib/prisma";
import { heureDeParis } from "../src/lib/reservation";
import { PAUL } from "./roles-exemple";

async function preparer() {
  const compte = await prisma.user.upsert({
    where: { email: PAUL.email },
    create: { id: randomUUID(), email: PAUL.email, name: "", emailVerified: true },
    update: { name: "" },
    select: { id: true },
  });
  const salle = await prisma.salle.findFirstOrThrow({
    where: { active: true },
    select: { id: true, prixHeureCentimes: true },
  });
  const commun = {
    salleId: salle.id,
    utilisateurId: compte.id,
    nomClient: PAUL.nom,
    emailClient: PAUL.email,
    montantTotalCentimes: salle.prixHeureCentimes,
  };
  // Confirmée (payée) : 7 h, avant l'ouverture, pour ne bloquer aucun
  // créneau des autres tests (R3). La session Stripe n'est jamais relue
  // pour une réservation confirmée.
  const payee = await prisma.reservation.create({
    data: {
      ...commun,
      debut: heureDeParis(dateDemo(), "07:00"),
      fin: heureDeParis(dateDemo(), "08:00"),
      statut: "CONFIRMEE",
      stripeSessionId: `cs_test_e2e_profil_${randomUUID()}`,
    },
    select: { id: true },
  });
  // En attente, jamais envoyée au paiement : supprimée avec le compte.
  const jamaisPayee = await prisma.reservation.create({
    data: {
      ...commun,
      debut: heureDeParis(dateDemo(), "18:00"),
      fin: heureDeParis(dateDemo(), "19:00"),
      statut: "EN_ATTENTE",
    },
    select: { id: true },
  });
  process.stdout.write(JSON.stringify({ payee: payee.id, jamaisPayee: jamaisPayee.id }));
}

async function etat(payee: string, jamaisPayee: string) {
  const compte = await prisma.user.findUnique({ where: { email: PAUL.email }, select: { id: true } });
  const sessions = compte ? await prisma.session.count({ where: { userId: compte.id } }) : 0;
  const reservations = await prisma.reservation.findMany({
    where: { id: { in: [payee, jamaisPayee] } },
    select: { id: true, nomClient: true, emailClient: true, utilisateurId: true, statut: true },
  });
  process.stdout.write(JSON.stringify({ compte: compte !== null, sessions, reservations }));
}

const [commande, ...args] = process.argv.slice(2);
(commande === "etat" ? etat(args[0], args[1]) : preparer()).finally(() => prisma.$disconnect());
