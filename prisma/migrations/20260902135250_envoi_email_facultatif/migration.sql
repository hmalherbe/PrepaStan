-- AlterTable
ALTER TABLE "ParametresApplication" ADD COLUMN     "envoiEmailEleve" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "envoiEmailKholleur" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "envoiEmailReferent" BOOLEAN NOT NULL DEFAULT true;
