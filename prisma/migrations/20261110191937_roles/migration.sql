-- AlterTable
ALTER TABLE "user" ADD COLUMN "role" TEXT DEFAULT 'CLIENT';

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Reservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "salleId" TEXT NOT NULL,
    "debut" DATETIME NOT NULL,
    "fin" DATETIME NOT NULL,
    "nomClient" TEXT NOT NULL,
    "emailClient" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "montantTotalCentimes" INTEGER NOT NULL,
    "stripeSessionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utilisateurId" TEXT,
    CONSTRAINT "Reservation_salleId_fkey" FOREIGN KEY ("salleId") REFERENCES "Salle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Reservation_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Reservation" ("createdAt", "debut", "emailClient", "fin", "id", "montantTotalCentimes", "nomClient", "salleId", "statut", "stripeSessionId") SELECT "createdAt", "debut", "emailClient", "fin", "id", "montantTotalCentimes", "nomClient", "salleId", "statut", "stripeSessionId" FROM "Reservation";
DROP TABLE "Reservation";
ALTER TABLE "new_Reservation" RENAME TO "Reservation";
CREATE UNIQUE INDEX "Reservation_stripeSessionId_key" ON "Reservation"("stripeSessionId");
CREATE INDEX "Reservation_salleId_debut_idx" ON "Reservation"("salleId", "debut");
CREATE INDEX "Reservation_utilisateurId_idx" ON "Reservation"("utilisateurId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
