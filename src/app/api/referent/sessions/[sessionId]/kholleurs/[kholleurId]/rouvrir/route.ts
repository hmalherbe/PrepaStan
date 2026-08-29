import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/referent/sessions/:sessionId/kholleurs/:kholleurId/rouvrir
// Rouvre la grille d'un kholleur avant la validation finale du référent,
// pour lui permettre de corriger une note ou une appréciation.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string; kholleurId: string }> }
) {
  const auth = await requireRole(["PROFESSEUR_REFERENT"]);
  if (auth instanceof NextResponse) return auth;
  const { sessionId, kholleurId } = await params;

  const session = await prisma.sessionKholle.findUniqueOrThrow({
    where: { id: sessionId },
    include: { validationReferent: true },
  });

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

  if (session.validationReferent?.statut === "VALIDE") {
    return NextResponse.json(
      { error: "Session déjà validée, réouverture impossible" },
      { status: 409 }
    );
  }

  await prisma.validationGrille.upsert({
    where: {
      kholleurId_sessionKholleId: { kholleurId, sessionKholleId: sessionId },
    },
    update: { statut: "EN_ATTENTE", dateValidation: null },
    create: { kholleurId, sessionKholleId: sessionId, statut: "EN_ATTENTE" },
  });

  return NextResponse.json({ ok: true });
}
