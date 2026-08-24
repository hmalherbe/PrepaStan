import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/referent/sessions/:sessionId/valider
// Valide la session entière : rejette si une seule grille de kholleur n'est
// pas encore validée. Une fois validé, les notes deviennent visibles aux
// élèves et la session passe CLOTUREE.
export async function POST(
  _req: Request,
  { params }: { params: { sessionId: string } }
) {
  const auth = await requireRole(["PROFESSEUR_REFERENT"]);
  if (auth instanceof NextResponse) return auth;
  const professeurReferentId = auth.user.id;
  const sessionKholleId = params.sessionId;

  const session = await prisma.sessionKholle.findUniqueOrThrow({ where: { id: sessionKholleId } });
  const estReferent = await prisma.professeurReferent.findUnique({
    where: {
      classeId_disciplineId: { classeId: session.classeId, disciplineId: session.disciplineId },
    },
  });
  if (!estReferent || estReferent.utilisateurId !== professeurReferentId) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const grillesNonValidees = await prisma.validationGrille.count({
    where: { sessionKholleId, statut: { not: "VALIDE" } },
  });

  if (grillesNonValidees > 0) {
    return NextResponse.json(
      { error: `${grillesNonValidees} grille(s) de kholleur en attente` },
      { status: 409 }
    );
  }

  await prisma.$transaction([
    prisma.validationReferent.upsert({
      where: { sessionKholleId },
      update: { statut: "VALIDE", dateValidation: new Date(), professeurReferentId },
      create: {
        sessionKholleId,
        professeurReferentId,
        statut: "VALIDE",
        dateValidation: new Date(),
      },
    }),
    prisma.sessionKholle.update({
      where: { id: sessionKholleId },
      data: { statut: "CLOTUREE" },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
