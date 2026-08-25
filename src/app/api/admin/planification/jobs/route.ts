import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  classeId: z.string(),
  semaine: z.number().int(),
  disciplineIds: z.array(z.string()).min(1),
});

// Au-delà de cette heure, un créneau est considéré "tardif" pour
// l'équilibrage des horaires de passage (voir calculerHistorique ci-dessous).
const SEUIL_TARDIF = "17:00";

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

  const historique = await calculerHistorique(
    eleves.map((e) => e.id),
    competences.map((c) => c.kholleurId),
    disciplineIds
  );

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
      historique,
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

// Agrège l'historique des khôlles déjà publiées (PLANIFIEE ou CLOTUREE, donc
// hors brouillon en cours) pour nourrir les objectifs "soft" du solveur :
// diversité des kholleurs par élève, équilibrage des horaires de passage,
// équirépartition de la charge des kholleurs sur la durée.
async function calculerHistorique(eleveIds: string[], kholleurIds: string[], disciplineIds: string[]) {
  const passagesHistoriques = await prisma.passage.findMany({
    where: {
      eleveId: { in: eleveIds },
      creneau: {
        sessionKholle: { disciplineId: { in: disciplineIds }, statut: { not: "PLANIFICATION" } },
      },
    },
    select: {
      eleveId: true,
      creneau: { select: { kholleurId: true, heureDebut: true, sessionKholle: { select: { disciplineId: true } } } },
    },
  });

  const eleveKholleur: Record<string, number> = {};
  const tardifEleve: Record<string, number> = {};

  for (const p of passagesHistoriques) {
    const cle = `${p.eleveId}|${p.creneau.sessionKholle.disciplineId}|${p.creneau.kholleurId}`;
    eleveKholleur[cle] = (eleveKholleur[cle] ?? 0) + 1;
    if (p.creneau.heureDebut >= SEUIL_TARDIF) {
      tardifEleve[p.eleveId] = (tardifEleve[p.eleveId] ?? 0) + 1;
    }
  }

  const chargeParKholleur = await prisma.creneau.groupBy({
    by: ["kholleurId"],
    where: { kholleurId: { in: kholleurIds }, sessionKholle: { statut: { not: "PLANIFICATION" } } },
    _count: { id: true },
  });
  const chargeKholleur = Object.fromEntries(chargeParKholleur.map((c) => [c.kholleurId, c._count.id]));

  return { eleveKholleur, chargeKholleur, tardifEleve };
}
