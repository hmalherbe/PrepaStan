import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { dureesParDefaut } from "@/lib/parametresDiscipline";
import { prisma } from "@/lib/prisma";

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesVersHeure(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const bodySchema = z.object({
  salleId: z.string().optional(),
  kholleurId: z.string().optional(),
  heureDebut: z.string().optional(),
  heureFin: z.string().optional(),
  // Absent = pas touché par l'admin : si heureDebut change, l'heure de
  // préparation est recalculée automatiquement (voir plus bas) plutôt que de
  // rester figée sur l'ancienne khôlle. Présent = valeur imposée telle quelle.
  heureDebutPreparation: z.string().optional(),
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
    include: {
      passages: true,
      sessionKholle: { select: { classeId: true, disciplineId: true, discipline: { select: { estLangueVivante: true } } } },
    },
  });

  let heureDebutPreparation = body.heureDebutPreparation ?? existant.heureDebutPreparation;
  if (body.heureDebutPreparation === undefined && body.heureDebut !== undefined && body.heureDebut !== existant.heureDebut) {
    const parametre = await prisma.parametreDiscipline.findUnique({
      where: {
        classeId_disciplineId: {
          classeId: existant.sessionKholle.classeId,
          disciplineId: existant.sessionKholle.disciplineId,
        },
      },
    });
    const { dureePreparationMinutes } =
      parametre ?? dureesParDefaut(existant.sessionKholle.discipline.estLangueVivante);
    heureDebutPreparation = minutesVersHeure(minutes(body.heureDebut) - dureePreparationMinutes);
  }

  const nouveau = {
    salleId: body.salleId ?? existant.salleId,
    kholleurId: body.kholleurId ?? existant.kholleurId,
    heureDebut: body.heureDebut ?? existant.heureDebut,
    heureFin: body.heureFin ?? existant.heureFin,
    heureDebutPreparation,
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
