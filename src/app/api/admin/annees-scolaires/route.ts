import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/annees-scolaires
export async function GET() {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const anneesScolaires = await prisma.anneeScolaire.findMany({ orderBy: { libelle: "desc" } });
  return NextResponse.json(anneesScolaires);
}

const bodySchema = z.object({ libelle: z.string().min(1) });

// POST /api/admin/annees-scolaires
export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const { libelle } = bodySchema.parse(await req.json());

  try {
    const anneeScolaire = await prisma.anneeScolaire.create({ data: { libelle } });
    return NextResponse.json(anneeScolaire, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Cette année scolaire existe déjà" }, { status: 409 });
  }
}
