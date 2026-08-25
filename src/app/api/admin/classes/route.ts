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
    include: { _count: { select: { eleves: true, disciplines: true } } },
    orderBy: [{ anneeScolaire: "desc" }, { nom: "asc" }],
  });

  return NextResponse.json(classes);
}

const bodySchema = z.object({
  nom: z.string().min(1),
  anneeScolaire: z.string().min(1),
});

// POST /api/admin/classes
// Crée une nouvelle classe.
export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const { nom, anneeScolaire } = bodySchema.parse(await req.json());

  const classe = await prisma.classe.create({ data: { nom, anneeScolaire } });
  return NextResponse.json(classe, { status: 201 });
}
