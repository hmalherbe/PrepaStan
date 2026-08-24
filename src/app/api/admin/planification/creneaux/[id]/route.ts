import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  salleId: z.string().optional(),
  kholleurId: z.string().optional(),
  heureDebut: z.string().optional(),
  heureFin: z.string().optional(),
});

// PUT /api/admin/planification/creneaux/:id
// Édition manuelle d'un créneau du brouillon (salle / kholleur / horaires),
// avec revérification des conflits (kholleur, salle, élève déjà occupé).
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = bodySchema.parse(await req.json());

  const existant = await prisma.creneau.findUniqueOrThrow({
    where: { id },
    include: { passages: true },
  });

  const nouveau = {
    salleId: body.salleId ?? existant.salleId,
    kholleurId: body.kholleurId ?? existant.kholleurId,
    heureDebut: body.heureDebut ?? existant.heureDebut,
    heureFin: body.heureFin ?? existant.heureFin,
  };

  const eleveIds = existant.passages.map((p) => p.eleveId);

  const chevauchants = await prisma.creneau.findMany({
    where: {
      id: { not: existant.id },
      date: existant.date,
      heureDebut: { lt: nouveau.heureFin },
      heureFin: { gt: nouveau.heureDebut },
      OR: [
        { kholleurId: nouveau.kholleurId },
        { salleId: nouveau.salleId },
        { passages: { some: { eleveId: { in: eleveIds } } } },
      ],
    },
  });

  if (chevauchants.length > 0) {
    return NextResponse.json(
      { error: "Conflit détecté sur ce créneau (kholleur, salle ou élève déjà occupé à cette heure)" },
      { status: 409 }
    );
  }

  const creneau = await prisma.creneau.update({ where: { id: existant.id }, data: nouveau });
  return NextResponse.json(creneau);
}
