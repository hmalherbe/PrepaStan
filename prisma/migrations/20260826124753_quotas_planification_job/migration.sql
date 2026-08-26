/*
  Warnings:

  - Added the required column `quotas` to the `PlanificationJob` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
-- Défaut '[]' pour les jobs déjà existants (générés avant l'introduction des
-- quotas) ; les nouveaux jobs fourniront toujours une vraie valeur.
ALTER TABLE "PlanificationJob" ADD COLUMN     "quotas" JSONB NOT NULL DEFAULT '[]';
