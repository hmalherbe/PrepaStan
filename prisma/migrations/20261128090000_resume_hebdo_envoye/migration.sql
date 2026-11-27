-- CreateTable
CREATE TABLE "ResumeHebdoEnvoye" (
    "id" TEXT NOT NULL,
    "semaineDebut" TIMESTAMP(3) NOT NULL,
    "dateEnvoi" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeHebdoEnvoye_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResumeHebdoEnvoye_semaineDebut_key" ON "ResumeHebdoEnvoye"("semaineDebut");
