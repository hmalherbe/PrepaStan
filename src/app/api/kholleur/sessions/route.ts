import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/kholleur/sessions
// Liste des sessions de khôlle où le kholleur connecté a des créneaux,
// avec son statut de validation pour chacune.
export async function GET() {
  const kholleurId = "TODO: récupérer depuis la session NextAuth";

  const sessions = await prisma.sessionKholle.findMany({
    where: { creneaux: { some: { kholleurId } } },
    include: {
      classe: true,
      discipline: true,
      creneaux: { where: { kholleurId } },
    },
  });

  return NextResponse.json(sessions);
}
