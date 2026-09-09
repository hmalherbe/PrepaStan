import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const creneauSchema = z.object({
  kholleurId: z.string(),
  salleId: z.string(),
  disciplineId: z.string(),
  date: z.string(),
  heureDebutPreparation: z.string(),
  heureDebut: z.string(),
  heureFin: z.string(),
  eleveIds: z.array(z.string()),
});

const bodySchema = z.discriminatedUnion("statut", [
  z.object({
    jobId: z.string(),
    statut: z.literal("SUCCES"),
    classeId: z.string(),
    semaine: z.number().int(),
    dateDebutSemaine: z.string(),
    creneaux: z.array(creneauSchema),
  }),
  z.object({
    jobId: z.string(),
    statut: z.literal("INFAISABLE"),
    message: z.string(),
  }),
  z.object({
    jobId: z.string(),
    statut: z.literal("ECHEC"),
    message: z.string(),
  }),
]);

// POST /api/internal/planification/callback
// Appelé par le microservice OR-Tools à la fin du calcul. Écrit les
// Creneau/Passage résultants en brouillon (SessionKholle reste en statut
// PLANIFICATION tant que l'admin n'a pas publié).
export async function POST(req: Request) {
  const secret = req.headers.get("x-callback-secret");
  if (secret !== process.env.PLANNING_CALLBACK_SECRET) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const payload = bodySchema.parse(await req.json());

  if (payload.statut !== "SUCCES") {
    await prisma.planificationJob.update({
      where: { id: payload.jobId },
      data: { statut: payload.statut, message: payload.message, dateFin: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  // Le référent choisi pour chaque discipline (un seul, pour la semaine
  // entière — voir GenererPlanningForm) a été fixé à la création du job et
  // stocké tel quel dans PlanificationJob.quotas (une ligne par jour, mais
  // toutes du même référent pour une discipline donnée) : on le relit ici
  // plutôt que de le faire remonter séparément depuis le solveur Python, qui
  // n'a pas besoin de le connaître.
  const job = await prisma.planificationJob.findUniqueOrThrow({ where: { id: payload.jobId } });
  const quotasJob = job.quotas as { disciplineId: string; referentId?: string }[];
  const referentParDiscipline = new Map<string, string>();
  for (const q of quotasJob) {
    if (q.referentId) referentParDiscipline.set(q.disciplineId, q.referentId);
  }

  await prisma.$transaction(async (tx) => {
    const disciplineIds = [...new Set(payload.creneaux.map((c) => c.disciplineId))];

    // Idempotence : si une session existait déjà pour cette classe/semaine/
    // discipline (régénération), on repart d'une base propre — qu'elle soit
    // encore en brouillon ou déjà publiée. Ne filtrer que sur le statut
    // PLANIFICATION laissait les anciens créneaux d'une session déjà publiée
    // intacts, et les nouveaux s'ajoutaient par-dessus (doublons). La cascade
    // Prisma supprime les passages/notes associés à ces créneaux.
    await tx.creneau.deleteMany({
      where: {
        sessionKholle: {
          classeId: payload.classeId,
          semaine: payload.semaine,
          disciplineId: { in: disciplineIds },
        },
      },
    });

    // Les validations (kholleur et référent) portaient sur les anciens
    // créneaux, qui viennent d'être supprimés : les garder laisserait une
    // grille "validée" verrouillée pour des créneaux tout neufs que le
    // kholleur n'a jamais vus, l'empêchant d'y saisir la moindre note.
    await tx.validationGrille.deleteMany({
      where: {
        sessionKholle: { classeId: payload.classeId, semaine: payload.semaine, disciplineId: { in: disciplineIds } },
      },
    });
    await tx.validationReferent.deleteMany({
      where: {
        sessionKholle: { classeId: payload.classeId, semaine: payload.semaine, disciplineId: { in: disciplineIds } },
      },
    });

    const lundi = new Date(`${payload.dateDebutSemaine}T00:00:00.000Z`);
    const vendredi = new Date(lundi);
    vendredi.setUTCDate(vendredi.getUTCDate() + 4);

    const sessions = new Map<string, string>(); // disciplineId -> sessionKholleId
    for (const disciplineId of disciplineIds) {
      // Régénérer une session déjà publiée la repasse en brouillon : les
      // créneaux ayant changé, l'admin doit revalider et republier avant que
      // les kholleurs ne les revoient.
      const referentId = referentParDiscipline.get(disciplineId);
      const session = await tx.sessionKholle.upsert({
        where: {
          classeId_disciplineId_semaine: {
            classeId: payload.classeId,
            disciplineId,
            semaine: payload.semaine,
          },
        },
        update: { statut: "PLANIFICATION", referentId },
        create: {
          classeId: payload.classeId,
          disciplineId,
          semaine: payload.semaine,
          dateDebut: lundi,
          dateFin: vendredi,
          referentId,
        },
      });
      sessions.set(disciplineId, session.id);
    }

    for (const c of payload.creneaux) {
      const creneau = await tx.creneau.create({
        data: {
          sessionKholleId: sessions.get(c.disciplineId)!,
          kholleurId: c.kholleurId,
          salleId: c.salleId,
          date: new Date(c.date),
          heureDebutPreparation: c.heureDebutPreparation,
          heureDebut: c.heureDebut,
          heureFin: c.heureFin,
        },
      });

      await tx.passage.createMany({
        data: c.eleveIds.map((eleveId, ordre) => ({
          creneauId: creneau.id,
          eleveId,
          ordre,
        })),
      });
    }

    await tx.planificationJob.update({
      where: { id: payload.jobId },
      data: { statut: "SUCCES", dateFin: new Date() },
    });
  });

  return NextResponse.json({ ok: true });
}
