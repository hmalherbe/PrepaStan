-- CreateTable
CREATE TABLE "ParametresApplication" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "delaiEnvoiMailsNotationJours" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ParametresApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RappelNotationEnvoye" (
    "id" TEXT NOT NULL,
    "sessionKholleId" TEXT NOT NULL,
    "kholleurId" TEXT NOT NULL,
    "dateEnvoi" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RappelNotationEnvoye_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RappelNotationEnvoye_sessionKholleId_kholleurId_key" ON "RappelNotationEnvoye"("sessionKholleId", "kholleurId");
