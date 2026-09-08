import { NextResponse } from "next/server";
import { z } from "zod";
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
      anneeScolaire: true,
      eleves: { orderBy: [{ nom: "asc" }] },
      disciplines: { include: { discipline: true } },
    },
  });
  const toutesDisciplines = await prisma.discipline.findMany({ orderBy: { nom: "asc" } });

  return NextResponse.json({ classe, toutesDisciplines });
}

const bodySchema = z.object({ nom: z.string().min(1) });

// PUT /api/admin/classes/:classeId
// L'année scolaire n'est pas modifiable ici : elle est fixée à la
// création par le sélecteur global du menu du haut.
export async function PUT(req: Request, { params }: { params: Promise<{ classeId: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { classeId } = await params;

  const { nom } = bodySchema.parse(await req.json());

  try {
    const classe = await prisma.classe.update({
      where: { id: classeId },
      data: { nom },
      include: { anneeScolaire: true },
    });
    return NextResponse.json(classe);
  } catch {
    return NextResponse.json(
      { error: "Une classe avec ce nom existe déjà pour cette année scolaire" },
      { status: 409 }
    );
  }
}

// DELETE /api/admin/classes/:classeId
// Les disciplines assignées (ClasseDiscipline) sont supprimées avec la
// classe. Les élèves de la classe le sont aussi (voir plus bas), tant
// qu'aucun n'a déjà de passage de khôlle enregistré — un vrai historique de
// notes ne doit jamais être perdu silencieusement. La présence de sessions
// de khôlle ou d'un référent assigné fait quant à elle toujours échouer la
// suppression (contrainte de clé étrangère).
export async function DELETE(_req: Request, { params }: { params: Promise<{ classeId: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { classeId } = await params;

  const eleves = await prisma.eleve.findMany({
    where: { classeId },
    select: { id: true, passages: { select: { id: true }, take: 1 } },
  });
  const eleveAvecHistorique = eleves.find((e) => e.passages.length > 0);
  if (eleveAvecHistorique) {
    return NextResponse.json(
      {
        error:
          "Impossible de supprimer cette classe : au moins un élève a déjà des passages de khôlle enregistrés. " +
          "Retirez-le d'abord.",
      },
      { status: 409 }
    );
  }

  try {
    await prisma.$transaction([
      prisma.eleve.deleteMany({ where: { classeId } }),
      prisma.classe.delete({ where: { id: classeId } }),
    ]);
  } catch {
    return NextResponse.json(
      {
        error:
          "Impossible de supprimer cette classe : elle a encore des sessions de khôlle ou un référent assigné. " +
          "Retirez-les d'abord.",
      },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
