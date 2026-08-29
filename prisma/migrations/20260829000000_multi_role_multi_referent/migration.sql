-- Un compte peut désormais cumuler plusieurs rôles (ex. khôlleur ET
-- professeur référent) : remplace la colonne "role" (unique) par un tableau
-- "roles", en conservant la donnée existante.
ALTER TABLE "Utilisateur" ADD COLUMN "roles" "Role"[] NOT NULL DEFAULT ARRAY[]::"Role"[];

UPDATE "Utilisateur" SET "roles" = ARRAY["role"];

ALTER TABLE "Utilisateur" ALTER COLUMN "roles" DROP DEFAULT;
ALTER TABLE "Utilisateur" DROP COLUMN "role";

-- Plusieurs référents peuvent désormais être assignés à la même
-- (classe, discipline) ; seule l'assignation exacte (même personne) reste
-- empêchée en double.
DROP INDEX "ProfesseurReferent_classeId_disciplineId_key";
CREATE UNIQUE INDEX "ProfesseurReferent_classeId_disciplineId_utilisateurId_key" ON "ProfesseurReferent"("classeId", "disciplineId", "utilisateurId");
