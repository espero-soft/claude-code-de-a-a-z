// Crée dans dev.db deux tickets de test pour e2e/admin-tickets.spec.ts, sans
// appeler l'API Claude : un ticket d'urgence basse, puis un d'urgence haute à
// transmettre à un conseiller. Retirés par e2e/nettoyage.ts (même e-mail).
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const EMAIL_TEST = "playwright@example.com";

async function main() {
  await prisma.ticket.create({
    data: {
      email: EMAIL_TEST,
      message: "Bonjour, quels sont vos horaires ?",
      categorie: "autre",
      urgence: "basse",
      resume: "Test Playwright : question sur les horaires.",
      brouillon: "Bonjour, le centre est ouvert du lundi au vendredi, de 8 h à 20 h.",
      aTransmettre: false,
    },
  });
  await prisma.ticket.create({
    data: {
      email: EMAIL_TEST,
      message: "Bonjour, j'ai été débité deux fois.",
      categorie: "paiement",
      urgence: "haute",
      resume: "Test Playwright : double débit signalé.",
      brouillon: "Bonjour, nous vérifions votre paiement et revenons vers vous.",
      aTransmettre: true,
      motifTransmission: "réclamation sur un paiement",
    },
  });
}

main().finally(() => prisma.$disconnect());
