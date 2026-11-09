-- CreateTable
CREATE TABLE "Salle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "capacite" INTEGER NOT NULL,
    "prixHeureCentimes" INTEGER NOT NULL,
    "photo" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Equipement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "salleId" TEXT NOT NULL,
    "debut" DATETIME NOT NULL,
    "fin" DATETIME NOT NULL,
    "nomClient" TEXT NOT NULL,
    "emailClient" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "montantTotalCentimes" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reservation_salleId_fkey" FOREIGN KEY ("salleId") REFERENCES "Salle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_EquipementToSalle" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_EquipementToSalle_A_fkey" FOREIGN KEY ("A") REFERENCES "Equipement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_EquipementToSalle_B_fkey" FOREIGN KEY ("B") REFERENCES "Salle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Salle_slug_key" ON "Salle"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Equipement_nom_key" ON "Equipement"("nom");

-- CreateIndex
CREATE INDEX "Reservation_salleId_debut_idx" ON "Reservation"("salleId", "debut");

-- CreateIndex
CREATE UNIQUE INDEX "_EquipementToSalle_AB_unique" ON "_EquipementToSalle"("A", "B");

-- CreateIndex
CREATE INDEX "_EquipementToSalle_B_index" ON "_EquipementToSalle"("B");
