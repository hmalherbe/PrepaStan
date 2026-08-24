import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/referent/sessions
// Sessions des disciplines/classes dont l'utilisateur connecté est
// professeur référent, avec la progression des validations.
export async function GET() {
  const auth = await requireRole(["PROFESSEUR_REFERENT"]);
  if (auth instanceof NextResponse) return auth;
  const utilisateurId = auth.user.id;

  const referents = await prisma.professeurReferent.findMany({
    where: { utilisateurId },
  });

  const sessions = await prisma.sessionKholle.findMany({
    where: {
      OR: referents.map((r) => ({ classeId: r.classeId, disciplineId: r.disciplineId })),
    },
    include: {
      classe: true,
      discipline: true,
      creneaux: { select: { kholleurId: true }, distinct: ["kholleurId"] },
      validationReferent: true,
    },
  });

  return NextResponse.json(sessions);
}
