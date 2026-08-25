import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE /api/admin/classes/:classeId/eleves/:eleveId
export async function DELETE(_req: Request, { params }: { params: Promise<{ eleveId: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { eleveId } = await params;

  try {
    await prisma.eleve.delete({ where: { id: eleveId } });
  } catch {
    return NextResponse.json(
      { error: "Impossible de supprimer un élève qui a déjà des passages de khôlle enregistrés" },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
