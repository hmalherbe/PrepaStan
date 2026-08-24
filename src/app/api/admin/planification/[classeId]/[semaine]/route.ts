import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/planification/:classeId/:semaine
// Planning proposé (brouillon ou publié), pour la vue calendrier de revue.
export async function GET(
  _req: Request,
  { params }: { params: { classeId: string; semaine: string } }
) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const sessions = await prisma.sessionKholle.findMany({
    where: { classeId: params.classeId, semaine: Number(params.semaine) },
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
