import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/kholleur/sessions/:sessionId/valider
// Valide la grille du kholleur connecté pour cette session : rejette si une
// note manque, sinon verrouille la saisie et vérifie si tous les kholleurs
// de la session ont désormais validé (pour notifier le référent).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireRole(["KHOLLEUR"]);
  if (auth instanceof NextResponse) return auth;
  const kholleurId = auth.user.id;
  const { sessionId: sessionKholleId } = await params;

  const passagesSansNote = await prisma.passage.count({
    where: {
      creneau: { sessionKholleId, kholleurId },
      note: { is: null },
    },
  });

  if (passagesSansNote > 0) {
    return NextResponse.json(
      { error: `${passagesSansNote} note(s) manquante(s)` },
      { status: 400 }
    );
  }

  await prisma.validationGrille.upsert({
    where: { kholleurId_sessionKholleId: { kholleurId, sessionKholleId } },
    update: { statut: "VALIDE", dateValidation: new Date() },
    create: { kholleurId, sessionKholleId, statut: "VALIDE", dateValidation: new Date() },
  });

  // TODO: si tous les kholleurs de la session ont validé, notifier le
  // professeur référent (email / notification in-app).

  return NextResponse.json({ ok: true });
}
