-- L'année scolaire devient une entité à part (table AnneeScolaire) au lieu
-- d'un simple champ texte sur Classe. Migration écrite à la main (plutôt
-- que générée) pour rétro-remplir les lignes existantes sans perte de
-- données : `prisma migrate dev` refuse ce genre de changement en mode
-- non-interactif.

-- 1. Nouvelle table.
CREATE TABLE "AnneeScolaire" (
    "id" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,

    CONSTRAINT "AnneeScolaire_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnneeScolaire_libelle_key" ON "AnneeScolaire"("libelle");

-- 2. Une ligne par valeur distincte déjà présente dans Classe.anneeScolaire.
INSERT INTO "AnneeScolaire" ("id", "libelle")
SELECT gen_random_uuid()::text, "anneeScolaire"
FROM "Classe"
GROUP BY "anneeScolaire";

-- 3. Nouvelle colonne de clé étrangère sur Classe, rétro-remplie puis
-- rendue obligatoire.
ALTER TABLE "Classe" ADD COLUMN "anneeScolaireId" TEXT;

UPDATE "Classe" c
SET "anneeScolaireId" = a."id"
FROM "AnneeScolaire" a
WHERE a."libelle" = c."anneeScolaire";

ALTER TABLE "Classe" ALTER COLUMN "anneeScolaireId" SET NOT NULL;

-- 4. Nettoyage de l'ancienne colonne et de sa contrainte, remplacées par
-- l'index unique et la clé étrangère sur la nouvelle colonne.
DROP INDEX "Classe_nom_anneeScolaire_key";
ALTER TABLE "Classe" DROP COLUMN "anneeScolaire";

CREATE UNIQUE INDEX "Classe_nom_anneeScolaireId_key" ON "Classe"("nom", "anneeScolaireId");

ALTER TABLE "Classe" ADD CONSTRAINT "Classe_anneeScolaireId_fkey"
    FOREIGN KEY ("anneeScolaireId") REFERENCES "AnneeScolaire"("id")
    ON UPDATE CASCADE ON DELETE RESTRICT;
