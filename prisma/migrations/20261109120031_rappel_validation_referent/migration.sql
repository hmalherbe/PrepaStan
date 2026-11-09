-- CreateTable
CREATE TABLE "RappelValidationReferentEnvoye" (
    "id" TEXT NOT NULL,
    "sessionKholleId" TEXT NOT NULL,
    "referentId" TEXT NOT NULL,
    "dateEnvoi" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RappelValidationReferentEnvoye_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RappelValidationReferentEnvoye_sessionKholleId_referentId_key" ON "RappelValidationReferentEnvoye"("sessionKholleId", "referentId");
