import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/planification/:classeId/:semaine
// Planning proposé (brouillon ou publié), pour la vue calendrier de revue.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ classeId: string; semaine: string }> }
) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { classeId, semaine } = await params;

  const sessions = await prisma.sessionKholle.findMany({
    where: { classeId, semaine: Number(semaine) },
    include: {
      discipline: true,
      creneaux: {
        include: {
          kholleur: true,
          salle: true,
          passages: { include: { eleve: true } },
        },
        orderBy: [{ date: "asc" }, { heureDebut: "asc" }],
      },
    },
  });

  return NextResponse.json(sessions);
}

// DELETE /api/admin/planification/:classeId/:semaine
// Supprime le brouillon (sessions encore en statut PLANIFICATION) pour
// permettre une régénération propre. La cascade Prisma supprime les
// créneaux, passages, notes et validations associés.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ classeId: string; semaine: string }> }
) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { classeId, semaine } = await params;

  const result = await prisma.sessionKholle.deleteMany({
    where: { classeId, semaine: Number(semaine), statut: "PLANIFICATION" },
  });

  return NextResponse.json({ sessionsSupprimees: result.count });
}
