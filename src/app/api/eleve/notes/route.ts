import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/eleve/notes
// Notes de l'élève connecté, uniquement pour les sessions dont la
// validation référent est actée (ValidationReferent.statut === VALIDE).
export async function GET() {
  const auth = await requireRole(["ELEVE"]);
  if (auth instanceof NextResponse) return auth;

  const eleve = await prisma.eleve.findUnique({ where: { utilisateurId: auth.user.id } });
  if (!eleve) {
    return NextResponse.json({ error: "Aucun élève associé à ce compte" }, { status: 404 });
  }
  const eleveId = eleve.id;

  const passages = await prisma.passage.findMany({
    where: {
      eleveId,
      creneau: { sessionKholle: { validationReferent: { statut: "VALIDE" } } },
    },
    include: {
      note: true,
      creneau: { include: { sessionKholle: { include: { discipline: true } } } },
    },
  });

  return NextResponse.json(passages);
}
