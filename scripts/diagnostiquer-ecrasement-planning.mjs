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
//      disciplines trouvées à l'étape 1 ;
//   4. si SEMAINES est fourni, TOUTES les SessionKholle (n'importe quelle
//      discipline) et TOUS les PlanificationJob (n'importe quelle classe)
//      pour ces numéros de semaine précis — utile quand on ne sait pas
//      encore si l'écrasement a touché la discipline/classe attendue.
// Sert à vérifier si un écrasement "sans confirmation" d'une session
// PLANIFIEE (voir /api/admin/planification/jobs/route.ts) vient d'un
// décalage entre le disciplineId réellement soumis et celui de la session
// déjà en base (garde basée sur classeId+semaine+disciplineId).
//
// Usage (depuis /root/PrepaStan sur le VPS) :
//   docker compose -f docker-compose.demo.yml exec -T \
//     -e CLASSE=L2 -e DISCIPLINE=droit -e SEMAINES=5,9 \
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

  const semainesSignalees0 = (process.env.SEMAINES ?? "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));
  if (semainesSignalees0.length > 0) {
    // Entièrement sans filtre de classe ni de discipline cette fois : montre
    // le classeId RÉEL (avec son nom et son année scolaire) derrière chaque
    // SessionKholle existante pour ces semaines, pour détecter un homonyme
    // de classe (même nom "L1", classeId différent) que la recherche par
    // nom ci-dessus aurait pu manquer.
    console.log(
      `\n=== TOUTES les SessionKholle (n'importe quelle classe/discipline) pour semaine(s) ${semainesSignalees0.join(", ")} ===`
    );
    const toutes = await prisma.sessionKholle.findMany({
      where: { semaine: { in: semainesSignalees0 } },
      include: { classe: { include: { anneeScolaire: { select: { libelle: true } } } }, discipline: { select: { nom: true } } },
      orderBy: [{ semaine: "asc" }],
    });
    if (toutes.length === 0) console.log("  Aucune.");
    for (const s of toutes) {
      console.log(
        `  session ${s.id} — semaine ${s.semaine} — classe "${s.classe.nom}" (classeId=${s.classeId}, année=${s.classe.anneeScolaire.libelle}) — ` +
          `discipline "${s.discipline.nom}" (disciplineId=${s.disciplineId}) — statut ${s.statut} — dateDebut ${s.dateDebut.toISOString().slice(0, 10)}`
      );
    }
  }

  for (const classe of classes) {
    console.log(`\n=== PlanificationJob récents pour la classe "${classe.nom}" (id=${classe.id}) ===`);
    const jobs = await prisma.planificationJob.findMany({
      where: { classeId: classe.id },
      orderBy: { dateDebut: "desc" },
      take: 50,
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

    // Toutes disciplines confondues, pour les semaines explicitement
    // signalées comme écrasées — au cas où ce ne serait pas (uniquement)
    // Droit, ou que le job en cause soit hors de la fenêtre ci-dessus.
    const semainesSignalees = (process.env.SEMAINES ?? "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));
    if (semainesSignalees.length > 0) {
      console.log(
        `\n=== SessionKholle (toutes disciplines) pour classe "${classe.nom}" + semaine(s) ${semainesSignalees.join(", ")} ===`
      );
      const sessions = await prisma.sessionKholle.findMany({
        where: { classeId: classe.id, semaine: { in: semainesSignalees } },
        include: { discipline: { select: { nom: true } } },
        orderBy: [{ semaine: "asc" }, { discipline: { nom: "asc" } }],
      });
      if (sessions.length === 0) console.log("  Aucune.");
      for (const s of sessions) {
        console.log(
          `  session ${s.id} — semaine ${s.semaine} — discipline "${s.discipline.nom}" (id=${s.disciplineId}) — ` +
            `statut ${s.statut} — dateDebut ${s.dateDebut.toISOString().slice(0, 10)}`
        );
      }

      console.log(
        `\n=== PlanificationJob (toutes classes) pour semaine(s) ${semainesSignalees.join(", ")} ===`
      );
      const jobsSemaines = await prisma.planificationJob.findMany({
        where: { semaine: { in: semainesSignalees } },
        orderBy: { dateDebut: "desc" },
      });
      if (jobsSemaines.length === 0) console.log("  Aucun.");
      const classeIdsVus = new Set();
      for (const job of jobsSemaines) {
        const quotas = job.quotas;
        const disciplineIdsQuotas = [...new Set(quotas.map((q) => q.disciplineId))];
        console.log(
          `  job ${job.id} — classeId ${job.classeId} — ${job.dateDebut.toISOString()} — statut ${job.statut} — ` +
            `semaine ${job.semaine} — disciplineId(s) dans quotas=${JSON.stringify(disciplineIdsQuotas)}`
        );
        classeIdsVus.add(job.classeId);
      }

      // Nom réel de chaque classe apparue ci-dessus, pour repérer si l'une
      // d'elles n'est PAS celle qu'on croit (ex. un autre classeId que
      // celui trouvé par recherche de nom au tout début de ce script).
      if (classeIdsVus.size > 0) {
        console.log(`\n=== Classe(s) réelle(s) derrière ces classeId ===`);
        const classesVues = await prisma.classe.findMany({
          where: { id: { in: [...classeIdsVus] } },
          include: { anneeScolaire: { select: { libelle: true } } },
        });
        for (const c of classesVues) {
          console.log(`  id=${c.id} nom="${c.nom}" année=${c.anneeScolaire.libelle}`);
        }
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
