// Crée (ou remet) dans dev.db un compte de test avec un rôle, adresse
// vérifiée, sans second facteur : npx tsx e2e/creer-compte.ts <e-mail> <rôle>.
// Adresses @roles.example.com uniquement (supprimées par e2e/nettoyage.ts).
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { DOMAINE_ROLES } from "./roles-exemple";

async function main() {
  const [email, role] = process.argv.slice(2);
  if (!email?.endsWith(DOMAINE_ROLES) || !["CLIENT", "EMPLOYE", "ADMIN"].includes(role)) {
    throw new Error(`Usage : e2e/creer-compte.ts <...${DOMAINE_ROLES}> <CLIENT|EMPLOYE|ADMIN>`);
  }
  const compte = await prisma.user.upsert({
    where: { email },
    create: { id: randomUUID(), email, name: "", emailVerified: true, role },
    update: { role, twoFactorEnabled: false },
    select: { id: true },
  });
  await prisma.twoFactor.deleteMany({ where: { userId: compte.id } });
}

main().finally(() => prisma.$disconnect());
