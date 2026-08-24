import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/admin/planification/:classeId/:semaine/publier
// Passe toutes les SessionKholle du brouillon en PLANIFIEE : les créneaux
// deviennent visibles pour les kholleurs concernés.
export async function POST(
  _req: Request,
  { params }: { params: { classeId: string; semaine: string } }
) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const result = await prisma.sessionKholle.updateMany({
    where: {
      classeId: params.classeId,
      semaine: Number(params.semaine),
      statut: "PLANIFICATION",
    },
    data: { statut: "PLANIFIEE" },
  });

  // TODO: notifier les kholleurs concernés (email / in-app).

  return NextResponse.json({ sessionsPubliees: result.count });
}
