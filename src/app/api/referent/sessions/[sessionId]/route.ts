import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/referent/sessions/:sessionId
// Détail complet d'une session : tous les kholleurs, tous les élèves,
// notes, appréciations et statut de validation de chaque grille.
export async function GET(
  _req: Request,
  { params }: { params: { sessionId: string } }
) {
  const session = await prisma.sessionKholle.findUniqueOrThrow({
    where: { id: params.sessionId },
    include: {
      classe: true,
      discipline: true,
      validationReferent: true,
      creneaux: {
        include: {
          kholleur: true,
          salle: true,
          passages: { include: { eleve: true, note: true }, orderBy: { ordre: "asc" } },
        },
        orderBy: [{ date: "asc" }, { heureDebut: "asc" }],
      },
    },
  });

  const kholleurIds = [...new Set(session.creneaux.map((c) => c.kholleurId))];
  const validations = await prisma.validationGrille.findMany({
    where: { sessionKholleId: session.id, kholleurId: { in: kholleurIds } },
  });

  return NextResponse.json({ session, validations });
}
