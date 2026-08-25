import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/disciplines
export async function GET() {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const disciplines = await prisma.discipline.findMany({
    include: { _count: { select: { classes: true, competences: true } } },
    orderBy: { nom: "asc" },
  });
  return NextResponse.json(disciplines);
}

const bodySchema = z.object({ nom: z.string().min(1) });

// POST /api/admin/disciplines
export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const { nom } = bodySchema.parse(await req.json());
  const discipline = await prisma.discipline.create({ data: { nom } });
  return NextResponse.json(discipline, { status: 201 });
}
