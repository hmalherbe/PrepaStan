-- DropForeignKey
ALTER TABLE "Eleve" DROP CONSTRAINT "Eleve_lv1Id_fkey";

-- DropForeignKey
ALTER TABLE "Eleve" DROP CONSTRAINT "Eleve_lv2Id_fkey";

-- AlterTable
ALTER TABLE "Creneau" ADD COLUMN     "heureDebutPreparation" TEXT;

-- CreateTable
CREATE TABLE "ParametreDiscipline" (
    "id" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "dureePreparationMinutes" INTEGER NOT NULL,
    "dureeKholleMinutes" INTEGER NOT NULL,

    CONSTRAINT "ParametreDiscipline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParametreDiscipline_classeId_disciplineId_key" ON "ParametreDiscipline"("classeId", "disciplineId");

-- AddForeignKey
ALTER TABLE "Eleve" ADD CONSTRAINT "Eleve_lv1Id_fkey" FOREIGN KEY ("lv1Id") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Eleve" ADD CONSTRAINT "Eleve_lv2Id_fkey" FOREIGN KEY ("lv2Id") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParametreDiscipline" ADD CONSTRAINT "ParametreDiscipline_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "Classe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParametreDiscipline" ADD CONSTRAINT "ParametreDiscipline_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
