import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE /api/admin/kholleurs/:kholleurId/disponibilites/:dispoId
export async function DELETE(_req: Request, { params }: { params: Promise<{ dispoId: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { dispoId } = await params;

  await prisma.disponibilite.delete({ where: { id: dispoId } });
  return NextResponse.json({ ok: true });
}
