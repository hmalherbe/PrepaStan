// Diagnostic ponctuel (lecture seule) : pour une (classe, semaine) déjà
// publiée, explique pourquoi aucune convocation élève n'a pu partir —
// vérifie le réglage global (ParametresApplication.envoiEmailEleve) puis,
// pour chaque élève concerné par les créneaux de cette semaine, s'il a un
// compte de connexion (Eleve.utilisateurId non nul) : c'est la condition
// requise pour recevoir un email (voir envoyerEmailsConvocationsEleves dans
// src/lib/notificationsPlanning.ts), la même que pour "note disponible"
// depuis le début.
//
// Usage (depuis /root/PrepaStan sur le VPS) :
//   docker compose -f docker-compose.prod.yml exec -T \
//     -e CLASSE=L1 -e SEMAINE=46 \
//     app node < scripts/diagnostiquer-convocations-manquantes.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const classeNomFiltre = process.env.CLASSE;
  const semaineFiltre = process.env.SEMAINE ? Number(process.env.SEMAINE) : undefined;
  if (!classeNomFiltre || semaineFiltre === undefined) {
    console.log("Usage : CLASSE=<nom> SEMAINE=<numéro> requis.");
    return;
  }

  const parametres = await prisma.parametresApplication.findUnique({ where: { id: "singleton" } });
  console.log("=== Réglages globaux ===");
  console.log(`  envoiEmailEleve : ${parametres?.envoiEmailEleve ?? "true (valeur par défaut, pas de ligne en base)"}`);
  console.log(`  modeTestEmail   : ${parametres?.modeTestEmail ?? false}`);
  console.log(`  emailModeTest   : ${parametres?.emailModeTest ?? "(vide)"}`);
  console.log();

  const sessions = await prisma.sessionKholle.findMany({
    where: { classe: { nom: classeNomFiltre }, semaine: semaineFiltre, statut: { not: "PLANIFICATION" } },
    include: {
      discipline: { select: { nom: true } },
      creneaux: { select: { passages: { select: { eleveId: true } } } },
    },
  });

  if (sessions.length === 0) {
    console.log(`Aucune session publiée trouvée pour ${classeNomFiltre}, semaine ${semaineFiltre}.`);
    return;
  }

  const eleveIds = new Set();
  for (const s of sessions) {
    for (const c of s.creneaux) {
      for (const p of c.passages) eleveIds.add(p.eleveId);
    }
  }

  const eleves = await prisma.eleve.findMany({
    where: { id: { in: [...eleveIds] } },
    select: {
      nom: true,
      prenom: true,
      emailContact: true,
      utilisateurId: true,
      utilisateur: { select: { email: true } },
    },
    orderBy: { nom: "asc" },
  });

  console.log(
    `=== ${classeNomFiltre}, semaine ${semaineFiltre} : ${sessions.map((s) => s.discipline.nom).join(", ")} ===`
  );
  console.log(`${eleves.length} élève(s) concerné(s) par ces créneaux.\n`);

  const avecCompte = eleves.filter((e) => e.utilisateurId !== null);
  const sansCompte = eleves.filter((e) => e.utilisateurId === null);

  console.log(`  Avec compte de connexion (recevraient la convocation) : ${avecCompte.length}`);
  for (const e of avecCompte) {
    console.log(`    - ${e.prenom} ${e.nom} -> ${e.utilisateur?.email ?? "(compte sans email ?!)"}`);
  }
  console.log(`\n  SANS compte de connexion (ne reçoivent jamais rien) : ${sansCompte.length}`);
  for (const e of sansCompte) {
    console.log(`    - ${e.prenom} ${e.nom} (email de contact : ${e.emailContact ?? "aucun"})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
