import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/kholleur/sessions/:sessionId/grille
// Mes créneaux, passages et notes existantes pour cette session.
export async function GET(
  _req: Request,
  { params }: { params: { sessionId: string } }
) {
  const kholleurId = "TODO: récupérer depuis la session NextAuth";

  const creneaux = await prisma.creneau.findMany({
    where: { sessionKholleId: params.sessionId, kholleurId },
    include: {
      salle: true,
      passages: { include: { eleve: true, note: true }, orderBy: { ordre: "asc" } },
    },
    orderBy: [{ date: "asc" }, { heureDebut: "asc" }],
  });

  const validation = await prisma.validationGrille.findUnique({
    where: {
      kholleurId_sessionKholleId: { kholleurId, sessionKholleId: params.sessionId },
    },
  });

  return NextResponse.json({ creneaux, validation });
}
