import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  nom: z.string().min(1),
});

// PUT /api/admin/salles/:salleId
export async function PUT(req: Request, { params }: { params: Promise<{ salleId: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { salleId } = await params;

  const { nom } = bodySchema.parse(await req.json());

  try {
    const salle = await prisma.salle.update({ where: { id: salleId }, data: { nom } });
    return NextResponse.json(salle);
  } catch {
    return NextResponse.json({ error: "Une salle avec ce nom existe déjà" }, { status: 409 });
  }
}

// DELETE /api/admin/salles/:salleId
// Échoue (contrainte de clé étrangère) si la salle est encore utilisée par
// un créneau de khôlle : il faut d'abord le déplacer ou le supprimer.
export async function DELETE(_req: Request, { params }: { params: Promise<{ salleId: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { salleId } = await params;

  try {
    await prisma.salle.delete({ where: { id: salleId } });
  } catch {
    return NextResponse.json(
      { error: "Impossible de supprimer cette salle : elle est encore utilisée par des créneaux de khôlle." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
