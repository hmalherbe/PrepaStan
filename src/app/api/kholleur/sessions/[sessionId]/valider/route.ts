import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/kholleur/sessions/:sessionId/valider
// Valide la grille du kholleur connecté pour cette session : rejette si une
// note OU une appréciation manque (les deux sont obligatoires), sinon
// verrouille la saisie et vérifie si tous les kholleurs de la session ont
// désormais validé (pour notifier le référent).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireRole(["KHOLLEUR"]);
  if (auth instanceof NextResponse) return auth;
  const kholleurId = auth.user.id;
  const { sessionId: sessionKholleId } = await params;

  const sessionKholle = await prisma.sessionKholle.findUniqueOrThrow({
    where: { id: sessionKholleId },
    select: { statut: true },
  });
  if (sessionKholle.statut === "CLOTUREE") {
    return NextResponse.json(
      { error: "Session déjà validée par le référent" },
      { status: 409 }
    );
  }

  const passagesIncomplets = await prisma.passage.count({
    where: {
      creneau: { sessionKholleId, kholleurId },
      OR: [{ note: { is: null } }, { note: { valeur: null } }, { note: { appreciation: null } }, { note: { appreciation: "" } }],
    },
  });

  if (passagesIncomplets > 0) {
    return NextResponse.json(
      { error: `${passagesIncomplets} note(s) et/ou appréciation(s) manquante(s)` },
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
