-- Remplace les deux booléens LV1/LV2 de Discipline (qui désignaient à tort
-- deux propriétés indépendantes de la discipline elle-même) par un seul
-- indicateur "est une langue vivante", et ajoute le choix de LV1/LV2 côté
-- élève (chacun pointe vers une discipline marquée langue vivante).
-- Écrite à la main (prisma migrate dev refuse le mode non-interactif dès
-- qu'une colonne supprimée contient des valeurs non nulles) ; sans risque
-- ici car estLV1/estLV2 valent partout `false` au moment de cette migration.

ALTER TABLE "Discipline" ADD COLUMN "estLangueVivante" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Discipline" DROP COLUMN "estLV1";
ALTER TABLE "Discipline" DROP COLUMN "estLV2";

ALTER TABLE "Eleve" ADD COLUMN "lv1Id" TEXT;
ALTER TABLE "Eleve" ADD COLUMN "lv2Id" TEXT;

ALTER TABLE "Eleve" ADD CONSTRAINT "Eleve_lv1Id_fkey"
    FOREIGN KEY ("lv1Id") REFERENCES "Discipline"("id")
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "Eleve" ADD CONSTRAINT "Eleve_lv2Id_fkey"
    FOREIGN KEY ("lv2Id") REFERENCES "Discipline"("id")
    ON UPDATE CASCADE ON DELETE RESTRICT;
