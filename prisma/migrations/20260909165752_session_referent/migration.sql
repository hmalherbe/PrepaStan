-- AlterTable
ALTER TABLE "SessionKholle" ADD COLUMN     "referentId" TEXT;

-- AddForeignKey
ALTER TABLE "SessionKholle" ADD CONSTRAINT "SessionKholle_referentId_fkey" FOREIGN KEY ("referentId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
