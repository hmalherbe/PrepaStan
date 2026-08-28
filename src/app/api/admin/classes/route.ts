import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ANNEE_SCOLAIRE_COOKIE, anneeScolaireCourante } from "@/lib/anneeScolaire";

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

const bodySchema = z.object({ nom: z.string().min(1) });

// POST /api/admin/classes
// Crée une nouvelle classe pour l'année scolaire courante, choisie
// globalement dans le menu du haut (cookie) plutôt que redemandée ici.
export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const { nom } = bodySchema.parse(await req.json());

  const cookieStore = await cookies();
  const libelle = cookieStore.get(ANNEE_SCOLAIRE_COOKIE)?.value ?? anneeScolaireCourante();
  const anneeScolaire = await prisma.anneeScolaire.upsert({
    where: { libelle },
    update: {},
    create: { libelle },
  });

  try {
    const classe = await prisma.classe.create({
      data: { nom, anneeScolaireId: anneeScolaire.id },
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
