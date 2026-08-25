import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/kholleurs/:kholleurId
// Détail d'un kholleur : ses disponibilités et disciplines.
export async function GET(_req: Request, { params }: { params: Promise<{ kholleurId: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { kholleurId } = await params;

  const kholleur = await prisma.utilisateur.findUniqueOrThrow({
    where: { id: kholleurId },
    include: {
      competences: { include: { discipline: true } },
      disponibilites: { orderBy: [{ jourSemaine: "asc" }, { heureDebut: "asc" }] },
    },
  });

  return NextResponse.json(kholleur);
}
