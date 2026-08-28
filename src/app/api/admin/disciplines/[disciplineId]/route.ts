import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  nom: z.string().min(1),
  estLangueVivante: z.boolean().default(false),
});

// PUT /api/admin/disciplines/:disciplineId
export async function PUT(req: Request, { params }: { params: Promise<{ disciplineId: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { disciplineId } = await params;

  const { nom, estLangueVivante } = bodySchema.parse(await req.json());

  try {
    const discipline = await prisma.discipline.update({
      where: { id: disciplineId },
      data: { nom, estLangueVivante },
    });
    return NextResponse.json(discipline);
  } catch {
    return NextResponse.json({ error: "Une discipline avec ce nom existe déjà" }, { status: 409 });
  }
}

// DELETE /api/admin/disciplines/:disciplineId
// Échoue (contrainte de clé étrangère) si la discipline est encore
// assignée à une classe, a des kholleurs compétents, des sessions de
// khôlle ou un référent : il faut d'abord tout retirer côté classe/kholleur.
export async function DELETE(_req: Request, { params }: { params: Promise<{ disciplineId: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { disciplineId } = await params;

  try {
    await prisma.discipline.delete({ where: { id: disciplineId } });
  } catch {
    return NextResponse.json(
      {
        error:
          "Impossible de supprimer cette discipline : elle est encore assignée à une classe, a des " +
          "kholleurs compétents, des sessions de khôlle, ou est choisie comme LV1/LV2 par un élève. " +
          "Retirez-les d'abord.",
      },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
