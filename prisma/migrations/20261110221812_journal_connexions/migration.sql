-- CreateTable
CREATE TABLE "EvenementConnexion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "utilisateurId" TEXT,
    "motif" TEXT,
    "ip" TEXT,
    "navigateur" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "EvenementConnexion_email_createdAt_idx" ON "EvenementConnexion"("email", "createdAt");

-- CreateIndex
CREATE INDEX "EvenementConnexion_createdAt_idx" ON "EvenementConnexion"("createdAt");
