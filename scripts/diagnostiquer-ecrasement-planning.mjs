// Diagnostic ponctuel (lecture seule) : pour une classe/discipline données,
// liste
//   1. tous les enregistrements Discipline dont le nom contient le texte
//      donné (révèle un doublon de discipline — deux id distincts pour ce
//      qui semble être "la même" discipline aux yeux de l'admin) ;
//   2. tous les PlanificationJob récents de cette classe, avec le détail
//      (semaine, disciplines[], disciplineId présents dans quotas) — pour
//      voir exactement ce qui a été soumis lors du job qui a écrasé une
//      session déjà publiée sans déclencher la confirmation attendue ;
//   3. l'historique SessionKholle actuel de cette classe pour les
//      disciplines trouvées à l'étape 1.
// Sert à vérifier si un écrasement "sans confirmation" d'une session
// PLANIFIEE (voir /api/admin/planification/jobs/route.ts) vient d'un
// décalage entre le disciplineId réellement soumis et celui de la session
// déjà en base (garde basée sur classeId+semaine+disciplineId).
//
// Usage (depuis /root/PrepaStan sur le VPS) :
//   docker compose -f docker-compose.demo.yml exec -T \
//     -e CLASSE=L2 -e DISCIPLINE=droit \
//     app node < scripts/diagnostiquer-ecrasement-planning.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const classeNom = process.env.CLASSE;
  const disciplineTexte = process.env.DISCIPLINE;
  if (!classeNom || !disciplineTexte) {
    console.log("Usage : CLASSE=<nom de classe> DISCIPLINE=<texte, insensible à la casse> requis.");
    return;
  }

  const disciplines = await prisma.discipline.findMany({
    where: { nom: { contains: disciplineTexte, mode: "insensitive" } },
  });
  console.log(`\n=== Discipline(s) dont le nom contient "${disciplineTexte}" ===`);
  if (disciplines.length === 0) {
    console.log("  Aucune.");
  } else if (disciplines.length > 1) {
    console.log(`  ⚠️  ${disciplines.length} ENREGISTREMENTS DISTINCTS (doublon probable) :`);
  }
  for (const d of disciplines) {
    console.log(`  id=${d.id} nom="${d.nom}" estLangueVivante=${d.estLangueVivante}`);
  }

  const classes = await prisma.classe.findMany({ where: { nom: { contains: classeNom, mode: "insensitive" } } });
  console.log(`\n=== Classe(s) dont le nom contient "${classeNom}" ===`);
  for (const c of classes) console.log(`  id=${c.id} nom="${c.nom}"`);

  for (const classe of classes) {
    console.log(`\n=== PlanificationJob récents pour la classe "${classe.nom}" (id=${classe.id}) ===`);
    const jobs = await prisma.planificationJob.findMany({
      where: { classeId: classe.id },
      orderBy: { dateDebut: "desc" },
      take: 10,
    });
    if (jobs.length === 0) console.log("  Aucun.");
    for (const job of jobs) {
      const quotas = job.quotas;
      const disciplineIdsQuotas = [...new Set(quotas.map((q) => q.disciplineId))];
      console.log(
        `  job ${job.id} — ${job.dateDebut.toISOString()} — statut ${job.statut} — semaine ${job.semaine} — ` +
          `disciplines[]=${JSON.stringify(job.disciplines)} — disciplineId(s) dans quotas=${JSON.stringify(disciplineIdsQuotas)}`
      );
    }

    for (const d of disciplines) {
      console.log(`\n=== SessionKholle actuelles pour classe "${classe.nom}" + discipline id=${d.id} ("${d.nom}") ===`);
      const sessions = await prisma.sessionKholle.findMany({
        where: { classeId: classe.id, disciplineId: d.id },
        orderBy: { semaine: "asc" },
      });
      if (sessions.length === 0) console.log("  Aucune.");
      for (const s of sessions) {
        console.log(
          `  session ${s.id} — semaine ${s.semaine} — statut ${s.statut} — dateDebut ${s.dateDebut.toISOString().slice(0, 10)}`
        );
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
