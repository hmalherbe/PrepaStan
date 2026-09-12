-- AlterTable
ALTER TABLE "ParametresApplication" ADD COLUMN     "poidsAlternanceLangue" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "poidsDiversiteKholleur" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "poidsEquilibrageHoraire" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "poidsEquilibrageKholleur" INTEGER NOT NULL DEFAULT 10;
