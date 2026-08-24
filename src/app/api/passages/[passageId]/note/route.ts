import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  valeur: z.number().min(0).max(20).nullable(),
  appreciation: z.string().nullable(),
});

// PUT /api/passages/:passageId/note
// Upsert de la note et de l'appréciation. Rejeté si la grille du kholleur
// pour cette session est déjà validée.
export async function PUT(
  req: Request,
  { params }: { params: { passageId: string } }
) {
  const auth = await requireRole(["KHOLLEUR"]);
  if (auth instanceof NextResponse) return auth;
  const kholleurId = auth.user.id;
  const body = bodySchema.parse(await req.json());

  const passage = await prisma.passage.findUniqueOrThrow({
    where: { id: params.passageId },
    include: { creneau: true },
  });

  if (passage.creneau.kholleurId !== kholleurId) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const validation = await prisma.validationGrille.findUnique({
    where: {
      kholleurId_sessionKholleId: {
        kholleurId,
        sessionKholleId: passage.creneau.sessionKholleId,
      },
    },
  });

  if (validation?.statut === "VALIDE") {
    return NextResponse.json(
      { error: "Grille déjà validée, modification impossible" },
      { status: 409 }
    );
  }

  const note = await prisma.note.upsert({
    where: { passageId: params.passageId },
    update: { ...body, dateSaisie: new Date() },
    create: { passageId: params.passageId, ...body, dateSaisie: new Date() },
  });

  return NextResponse.json(note);
}
