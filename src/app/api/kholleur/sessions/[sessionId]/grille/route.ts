import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/kholleur/sessions/:sessionId/grille
// Mes créneaux, passages et notes existantes pour cette session.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireRole(["KHOLLEUR"]);
  if (auth instanceof NextResponse) return auth;
  const kholleurId = auth.user.id;
  const { sessionId } = await params;

  const creneaux = await prisma.creneau.findMany({
    where: { sessionKholleId: sessionId, kholleurId },
    include: {
      salle: true,
      passages: { include: { eleve: true, note: true }, orderBy: { ordre: "asc" } },
    },
    orderBy: [{ date: "asc" }, { heureDebut: "asc" }],
  });

  const validation = await prisma.validationGrille.findUnique({
    where: {
      kholleurId_sessionKholleId: { kholleurId, sessionKholleId: sessionId },
    },
  });

  return NextResponse.json({ creneaux, validation });
}
