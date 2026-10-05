-- CreateTable
CREATE TABLE "EleveDispense" (
    "id" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,

    CONSTRAINT "EleveDispense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EleveDispense_eleveId_disciplineId_key" ON "EleveDispense"("eleveId", "disciplineId");

-- AddForeignKey
ALTER TABLE "EleveDispense" ADD CONSTRAINT "EleveDispense_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "Eleve"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EleveDispense" ADD CONSTRAINT "EleveDispense_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
