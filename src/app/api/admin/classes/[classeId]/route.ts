import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/classes/:classeId
// Détail d'une classe : élèves, disciplines assignées, et la liste complète
// des disciplines existantes (pour la case à cocher d'assignation).
export async function GET(_req: Request, { params }: { params: Promise<{ classeId: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { classeId } = await params;

  const classe = await prisma.classe.findUniqueOrThrow({
    where: { id: classeId },
    include: {
      eleves: { orderBy: [{ nom: "asc" }] },
      disciplines: { include: { discipline: true } },
    },
  });
  const toutesDisciplines = await prisma.discipline.findMany({ orderBy: { nom: "asc" } });

  return NextResponse.json({ classe, toutesDisciplines });
}
