-- DropTable
DROP TABLE "RappelNotationEnvoye";

-- CreateTable
CREATE TABLE "RappelJourMemeEnvoye" (
    "id" TEXT NOT NULL,
    "kholleurId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dateEnvoi" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RappelJourMemeEnvoye_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RappelJourMemeEnvoye_kholleurId_date_key" ON "RappelJourMemeEnvoye"("kholleurId", "date");
