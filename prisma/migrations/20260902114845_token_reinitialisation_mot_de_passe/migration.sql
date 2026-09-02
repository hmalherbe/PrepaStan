-- CreateTable
CREATE TABLE "TokenReinitialisationMotDePasse" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "expiration" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenReinitialisationMotDePasse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenReinitialisationMotDePasse_tokenHash_key" ON "TokenReinitialisationMotDePasse"("tokenHash");

-- CreateIndex
CREATE INDEX "TokenReinitialisationMotDePasse_utilisateurId_idx" ON "TokenReinitialisationMotDePasse"("utilisateurId");

-- AddForeignKey
ALTER TABLE "TokenReinitialisationMotDePasse" ADD CONSTRAINT "TokenReinitialisationMotDePasse_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;
