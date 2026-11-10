// Prépare dans dev.db les comptes de test des rôles (e2e/roles.spec.ts,
// e2e/fuite-reservation.spec.ts) et une réservation EN_ATTENTE dont le
// titulaire est le client A. Écrit {"reservationId": "..."} sur la sortie.
// Adresses @roles.example.com, supprimées par e2e/nettoyage.ts.
// Lancé par tsx (le client Prisma généré est un module ESM, que le chargeur
// de Playwright ne sait pas importer).
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { dateDemo } from "../src/lib/date-demo";
import { heureDeParis } from "../src/lib/reservation";
import { COMPTES_ROLES } from "./roles-exemple";

async function main() {
  for (const { email, role } of Object.values(COMPTES_ROLES)) {
    await prisma.user.upsert({
      where: { email },
      create: { id: randomUUID(), email, name: "", emailVerified: true, role },
      update: { role },
    });
  }
  const titulaire = await prisma.user.findUniqueOrThrow({
    where: { email: COMPTES_ROLES.clientA.email },
    select: { id: true },
  });
  const salle = await prisma.salle.findFirstOrThrow({
    where: { active: true },
    select: { id: true, prixHeureCentimes: true },
  });

  // EN_ATTENTE (sans session Stripe) : ne bloque aucun créneau (R3) et
  // affiche le bouton « Payer » au seul titulaire.
  const reservation = await prisma.reservation.create({
    data: {
      salleId: salle.id,
      utilisateurId: titulaire.id,
      debut: heureDeParis(dateDemo(), "15:00"),
      fin: heureDeParis(dateDemo(), "16:00"),
      nomClient: COMPTES_ROLES.clientA.nom,
      emailClient: COMPTES_ROLES.clientA.email,
      statut: "EN_ATTENTE",
      montantTotalCentimes: salle.prixHeureCentimes,
    },
    select: { id: true },
  });
  process.stdout.write(JSON.stringify({ reservationId: reservation.id }));
}

main().finally(() => prisma.$disconnect());
