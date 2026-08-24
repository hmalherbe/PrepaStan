import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/eleve/notes
// Notes de l'élève connecté, uniquement pour les sessions dont la
// validation référent est actée (ValidationReferent.statut === VALIDE).
export async function GET() {
  const eleveId = "TODO: récupérer depuis la session NextAuth";

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
