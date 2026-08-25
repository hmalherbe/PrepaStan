import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE /api/admin/referents/:referentId
// Retire l'assignation référent (le compte utilisateur n'est pas supprimé).
export async function DELETE(_req: Request, { params }: { params: Promise<{ referentId: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { referentId } = await params;

  await prisma.professeurReferent.delete({ where: { id: referentId } });
  return NextResponse.json({ ok: true });
}
