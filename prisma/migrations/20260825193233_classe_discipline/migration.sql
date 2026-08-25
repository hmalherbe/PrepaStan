-- CreateTable
CREATE TABLE "ClasseDiscipline" (
    "id" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,

    CONSTRAINT "ClasseDiscipline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClasseDiscipline_classeId_disciplineId_key" ON "ClasseDiscipline"("classeId", "disciplineId");

-- AddForeignKey
ALTER TABLE "ClasseDiscipline" ADD CONSTRAINT "ClasseDiscipline_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "Classe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClasseDiscipline" ADD CONSTRAINT "ClasseDiscipline_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
