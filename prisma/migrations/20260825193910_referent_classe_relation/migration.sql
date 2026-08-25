-- AddForeignKey
ALTER TABLE "ProfesseurReferent" ADD CONSTRAINT "ProfesseurReferent_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "Classe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
