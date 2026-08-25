import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const creneauSchema = z.object({
  kholleurId: z.string(),
  salleId: z.string(),
  disciplineId: z.string(),
  date: z.string(),
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

  await prisma.$transaction(async (tx) => {
    const disciplineIds = [...new Set(payload.creneaux.map((c) => c.disciplineId))];

    // Idempotence : si un brouillon existait déjà pour cette classe/semaine/
    // discipline (régénération), on repart d'une base propre. La cascade
    // Prisma supprime les passages/notes associés à ces créneaux.
    await tx.creneau.deleteMany({
      where: {
        sessionKholle: {
          classeId: payload.classeId,
          semaine: payload.semaine,
          disciplineId: { in: disciplineIds },
          statut: "PLANIFICATION",
        },
      },
    });

    const lundi = new Date(`${payload.dateDebutSemaine}T00:00:00.000Z`);
    const vendredi = new Date(lundi);
    vendredi.setUTCDate(vendredi.getUTCDate() + 4);

    const sessions = new Map<string, string>(); // disciplineId -> sessionKholleId
    for (const disciplineId of disciplineIds) {
      const session = await tx.sessionKholle.upsert({
        where: {
          classeId_disciplineId_semaine: {
            classeId: payload.classeId,
            disciplineId,
            semaine: payload.semaine,
          },
        },
        update: {},
        create: {
          classeId: payload.classeId,
          disciplineId,
          semaine: payload.semaine,
          dateDebut: lundi,
          dateFin: vendredi,
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
