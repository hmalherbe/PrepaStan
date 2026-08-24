import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  classeId: z.string(),
  semaine: z.number().int(),
  disciplineIds: z.array(z.string()).min(1),
});

// POST /api/admin/planification/jobs
// Crée un job de planification et appelle le microservice OR-Tools de façon
// asynchrone (fire-and-forget) ; le microservice rappelle
// /api/internal/planification/callback à la fin du calcul.
export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const lanceParId = auth.user.id;
  const { classeId, semaine, disciplineIds } = bodySchema.parse(await req.json());

  const job = await prisma.planificationJob.create({
    data: { classeId, semaine, disciplines: disciplineIds, lanceParId },
  });

  const [eleves, disponibilites, competences, salles] = await Promise.all([
    prisma.eleve.findMany({ where: { classeId } }),
    prisma.disponibilite.findMany({
      where: { kholleur: { competences: { some: { disciplineId: { in: disciplineIds } } } } },
    }),
    prisma.competence.findMany({ where: { disciplineId: { in: disciplineIds } } }),
    prisma.salle.findMany(),
  ]);

  const solverUrl = process.env.PLANNING_SOLVER_URL;
  if (!solverUrl) {
    return NextResponse.json({ error: "PLANNING_SOLVER_URL non configuré" }, { status: 500 });
  }

  // Appel fire-and-forget : on ne bloque pas la réponse HTTP sur le calcul.
  fetch(`${solverUrl}/solve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jobId: job.id,
      classeId,
      semaine,
      eleves,
      disponibilites,
      competences,
      salles,
      callbackUrl: `${process.env.NEXTAUTH_URL}/api/internal/planification/callback`,
      callbackSecret: process.env.PLANNING_CALLBACK_SECRET,
    }),
  }).catch(async (err) => {
    await prisma.planificationJob.update({
      where: { id: job.id },
      data: { statut: "ECHEC", message: String(err), dateFin: new Date() },
    });
  });

  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
