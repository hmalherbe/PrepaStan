-- AlterTable
ALTER TABLE "PlanificationJob" ADD COLUMN     "affectationsForcees" JSONB NOT NULL DEFAULT '[]';
