import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/classes
// Liste des classes avec quelques compteurs pour l'écran de gestion.
export async function GET() {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const classes = await prisma.classe.findMany({
    include: { anneeScolaire: true, _count: { select: { eleves: true, disciplines: true } } },
    orderBy: [{ anneeScolaire: { libelle: "desc" } }, { nom: "asc" }],
  });

  return NextResponse.json(classes);
}

const bodySchema = z.object({
  nom: z.string().min(1),
  anneeScolaireId: z.string().min(1),
});

// POST /api/admin/classes
// Crée une nouvelle classe. L'année scolaire est déjà créée séparément
// (voir /api/admin/annees-scolaires) : ici on ne fait que la référencer.
export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const { nom, anneeScolaireId } = bodySchema.parse(await req.json());

  try {
    const classe = await prisma.classe.create({
      data: { nom, anneeScolaireId },
      include: { anneeScolaire: true },
    });
    return NextResponse.json(classe, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Une classe avec ce nom existe déjà pour cette année scolaire" },
      { status: 409 }
    );
  }
}
