-- CreateTable
CREATE TABLE "CodeSuppressionCompte" (
    "utilisateurId" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "empreinte" TEXT NOT NULL,
    "essais" INTEGER NOT NULL DEFAULT 0,
    "expireLe" DATETIME NOT NULL
);
