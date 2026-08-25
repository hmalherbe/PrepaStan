import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/admin/classes/:classeId/disciplines/:disciplineId
// Assigne une discipline à une classe (indépendamment de tout référent).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ classeId: string; disciplineId: string }> }
) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { classeId, disciplineId } = await params;

  await prisma.classeDiscipline.upsert({
    where: { classeId_disciplineId: { classeId, disciplineId } },
    update: {},
    create: { classeId, disciplineId },
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/classes/:classeId/disciplines/:disciplineId
// Retire une discipline de la classe.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ classeId: string; disciplineId: string }> }
) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { classeId, disciplineId } = await params;

  await prisma.classeDiscipline.delete({
    where: { classeId_disciplineId: { classeId, disciplineId } },
  });

  return NextResponse.json({ ok: true });
}
