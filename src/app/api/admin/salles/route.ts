import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/salles
export async function GET() {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const salles = await prisma.salle.findMany({
    include: { _count: { select: { creneaux: true } } },
    orderBy: { nom: "asc" },
  });
  return NextResponse.json(salles);
}

const bodySchema = z.object({
  nom: z.string().min(1),
});

// POST /api/admin/salles
export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const { nom } = bodySchema.parse(await req.json());

  try {
    const salle = await prisma.salle.create({ data: { nom } });
    return NextResponse.json(salle, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Une salle avec ce nom existe déjà" }, { status: 409 });
  }
}
