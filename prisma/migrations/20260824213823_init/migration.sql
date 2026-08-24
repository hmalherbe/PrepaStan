-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'KHOLLEUR', 'PROFESSEUR_REFERENT', 'ELEVE');

-- CreateEnum
CREATE TYPE "StatutSession" AS ENUM ('PLANIFICATION', 'PLANIFIEE', 'EN_COURS', 'CLOTUREE');

-- CreateEnum
CREATE TYPE "StatutValidation" AS ENUM ('EN_ATTENTE', 'VALIDE');

-- CreateEnum
CREATE TYPE "JobStatut" AS ENUM ('EN_COURS', 'SUCCES', 'ECHEC', 'INFAISABLE');

-- CreateTable
CREATE TABLE "Utilisateur" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Classe" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "anneeScolaire" TEXT NOT NULL,

    CONSTRAINT "Classe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Eleve" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "utilisateurId" TEXT,

    CONSTRAINT "Eleve_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discipline" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,

    CONSTRAINT "Discipline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competence" (
    "kholleurId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,

    CONSTRAINT "Competence_pkey" PRIMARY KEY ("kholleurId","disciplineId")
);

-- CreateTable
CREATE TABLE "ProfesseurReferent" (
    "id" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,

    CONSTRAINT "ProfesseurReferent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Disponibilite" (
    "id" TEXT NOT NULL,
    "kholleurId" TEXT NOT NULL,
    "jourSemaine" INTEGER,
    "date" TIMESTAMP(3),
    "heureDebut" TEXT NOT NULL,
    "heureFin" TEXT NOT NULL,

    CONSTRAINT "Disponibilite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Salle" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,

    CONSTRAINT "Salle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionKholle" (
    "id" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "semaine" INTEGER NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "statut" "StatutSession" NOT NULL DEFAULT 'PLANIFICATION',

    CONSTRAINT "SessionKholle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Creneau" (
    "id" TEXT NOT NULL,
    "sessionKholleId" TEXT NOT NULL,
    "kholleurId" TEXT NOT NULL,
    "salleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "heureDebut" TEXT NOT NULL,
    "heureFin" TEXT NOT NULL,

    CONSTRAINT "Creneau_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Passage" (
    "id" TEXT NOT NULL,
    "creneauId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,

    CONSTRAINT "Passage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "passageId" TEXT NOT NULL,
    "valeur" DECIMAL(65,30),
    "appreciation" TEXT,
    "dateSaisie" TIMESTAMP(3),

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationGrille" (
    "id" TEXT NOT NULL,
    "kholleurId" TEXT NOT NULL,
    "sessionKholleId" TEXT NOT NULL,
    "statut" "StatutValidation" NOT NULL DEFAULT 'EN_ATTENTE',
    "dateValidation" TIMESTAMP(3),

    CONSTRAINT "ValidationGrille_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationReferent" (
    "id" TEXT NOT NULL,
    "sessionKholleId" TEXT NOT NULL,
    "professeurReferentId" TEXT NOT NULL,
    "statut" "StatutValidation" NOT NULL DEFAULT 'EN_ATTENTE',
    "dateValidation" TIMESTAMP(3),

    CONSTRAINT "ValidationReferent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanificationJob" (
    "id" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "semaine" INTEGER NOT NULL,
    "disciplines" TEXT[],
    "statut" "JobStatut" NOT NULL DEFAULT 'EN_COURS',
    "lanceParId" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateFin" TIMESTAMP(3),
    "message" TEXT,

    CONSTRAINT "PlanificationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_email_key" ON "Utilisateur"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Classe_nom_anneeScolaire_key" ON "Classe"("nom", "anneeScolaire");

-- CreateIndex
CREATE UNIQUE INDEX "Eleve_utilisateurId_key" ON "Eleve"("utilisateurId");

-- CreateIndex
CREATE UNIQUE INDEX "Discipline_nom_key" ON "Discipline"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "ProfesseurReferent_classeId_disciplineId_key" ON "ProfesseurReferent"("classeId", "disciplineId");

-- CreateIndex
CREATE UNIQUE INDEX "Salle_nom_key" ON "Salle"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "SessionKholle_classeId_disciplineId_semaine_key" ON "SessionKholle"("classeId", "disciplineId", "semaine");

-- CreateIndex
CREATE UNIQUE INDEX "Passage_creneauId_eleveId_key" ON "Passage"("creneauId", "eleveId");

-- CreateIndex
CREATE UNIQUE INDEX "Note_passageId_key" ON "Note"("passageId");

-- CreateIndex
CREATE UNIQUE INDEX "ValidationGrille_kholleurId_sessionKholleId_key" ON "ValidationGrille"("kholleurId", "sessionKholleId");

-- CreateIndex
CREATE UNIQUE INDEX "ValidationReferent_sessionKholleId_key" ON "ValidationReferent"("sessionKholleId");

-- AddForeignKey
ALTER TABLE "Eleve" ADD CONSTRAINT "Eleve_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "Classe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Eleve" ADD CONSTRAINT "Eleve_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competence" ADD CONSTRAINT "Competence_kholleurId_fkey" FOREIGN KEY ("kholleurId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competence" ADD CONSTRAINT "Competence_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfesseurReferent" ADD CONSTRAINT "ProfesseurReferent_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfesseurReferent" ADD CONSTRAINT "ProfesseurReferent_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disponibilite" ADD CONSTRAINT "Disponibilite_kholleurId_fkey" FOREIGN KEY ("kholleurId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionKholle" ADD CONSTRAINT "SessionKholle_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "Classe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionKholle" ADD CONSTRAINT "SessionKholle_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creneau" ADD CONSTRAINT "Creneau_sessionKholleId_fkey" FOREIGN KEY ("sessionKholleId") REFERENCES "SessionKholle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creneau" ADD CONSTRAINT "Creneau_kholleurId_fkey" FOREIGN KEY ("kholleurId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creneau" ADD CONSTRAINT "Creneau_salleId_fkey" FOREIGN KEY ("salleId") REFERENCES "Salle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passage" ADD CONSTRAINT "Passage_creneauId_fkey" FOREIGN KEY ("creneauId") REFERENCES "Creneau"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passage" ADD CONSTRAINT "Passage_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "Eleve"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "Passage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationGrille" ADD CONSTRAINT "ValidationGrille_sessionKholleId_fkey" FOREIGN KEY ("sessionKholleId") REFERENCES "SessionKholle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationReferent" ADD CONSTRAINT "ValidationReferent_sessionKholleId_fkey" FOREIGN KEY ("sessionKholleId") REFERENCES "SessionKholle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanificationJob" ADD CONSTRAINT "PlanificationJob_lanceParId_fkey" FOREIGN KEY ("lanceParId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
