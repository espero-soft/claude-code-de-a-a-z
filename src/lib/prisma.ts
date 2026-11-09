import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

// Un seul client pour toute l'application. En développement, le rechargement
// à chaud réévalue ce module : on garde le client sur globalThis pour ne pas
// ouvrir une nouvelle connexion à chaque modification.
const globalPourPrisma = globalThis as unknown as { prisma?: PrismaClient };

function creerClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL n'est pas définie (voir .env.example).");
  }
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}

export const prisma = globalPourPrisma.prisma ?? creerClient();

if (process.env.NODE_ENV !== "production") {
  globalPourPrisma.prisma = prisma;
}
