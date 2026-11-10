-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "message" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "urgence" TEXT NOT NULL,
    "resume" TEXT NOT NULL,
    "reservationId" TEXT,
    "brouillon" TEXT NOT NULL,
    "aTransmettre" BOOLEAN NOT NULL,
    "motifTransmission" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'A_TRAITER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "valideLe" DATETIME,
    CONSTRAINT "Ticket_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Ticket_statut_idx" ON "Ticket"("statut");
