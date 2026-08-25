import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/kholleurs
export async function GET() {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const kholleurs = await prisma.utilisateur.findMany({
    where: { role: "KHOLLEUR" },
    include: {
      competences: { include: { discipline: true } },
      _count: { select: { disponibilites: true } },
    },
    orderBy: [{ nom: "asc" }],
  });
  return NextResponse.json(kholleurs);
}

const bodySchema = z.object({
  nom: z.string().min(1),
  prenom: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(4),
  disciplineIds: z.array(z.string()).min(1),
});

// POST /api/admin/kholleurs
// Crée un compte kholleur et ses compétences (disciplines qu'il peut kholler).
export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const body = bodySchema.parse(await req.json());

  const kholleur = await prisma.utilisateur.create({
    data: {
      email: body.email,
      password: await bcrypt.hash(body.password, 12),
      nom: body.nom,
      prenom: body.prenom,
      role: "KHOLLEUR",
      competences: { create: body.disciplineIds.map((disciplineId) => ({ disciplineId })) },
    },
  });

  return NextResponse.json(kholleur, { status: 201 });
}
