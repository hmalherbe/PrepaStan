-- CreateTable
CREATE TABLE "EchecEnvoiEmail" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "destinataire" TEXT NOT NULL,
    "contexte" TEXT,
    "erreur" TEXT NOT NULL,
    "dateEnvoi" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EchecEnvoiEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EchecEnvoiEmail_dateEnvoi_idx" ON "EchecEnvoiEmail"("dateEnvoi");
