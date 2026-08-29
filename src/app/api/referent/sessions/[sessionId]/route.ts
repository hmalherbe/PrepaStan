import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/referent/sessions/:sessionId
// Détail complet d'une session : tous les kholleurs, tous les élèves,
// notes, appréciations et statut de validation de chaque grille.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireRole(["PROFESSEUR_REFERENT", "ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { sessionId } = await params;

  const session = await prisma.sessionKholle.findUniqueOrThrow({
    where: { id: sessionId },
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

  if (auth.user.roles.includes("PROFESSEUR_REFERENT") && !auth.user.roles.includes("ADMIN")) {
    const estReferent = await prisma.professeurReferent.findFirst({
      where: {
        classeId: session.classeId,
        disciplineId: session.disciplineId,
        utilisateurId: auth.user.id,
      },
    });
    if (!estReferent) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
  }

  const kholleurIds = [...new Set(session.creneaux.map((c) => c.kholleurId))];
  const validations = await prisma.validationGrille.findMany({
    where: { sessionKholleId: session.id, kholleurId: { in: kholleurIds } },
  });

  return NextResponse.json({ session, validations });
}
