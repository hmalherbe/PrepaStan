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
    where: { roles: { has: "KHOLLEUR" } },
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
// Si l'email correspond déjà à un compte existant (ex. un professeur
// référent), ajoute simplement le rôle KHOLLEUR à ce compte au lieu d'échouer
// : une même personne peut cumuler les deux rôles sous un seul login.
export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const body = bodySchema.parse(await req.json());

  const existant = await prisma.utilisateur.findUnique({ where: { email: body.email } });

  const kholleur = existant
    ? await prisma.utilisateur.update({
        where: { id: existant.id },
        data: {
          roles: existant.roles.includes("KHOLLEUR") ? existant.roles : [...existant.roles, "KHOLLEUR"],
          competences: { create: body.disciplineIds.map((disciplineId) => ({ disciplineId })) },
        },
      })
    : await prisma.utilisateur.create({
        data: {
          email: body.email,
          password: await bcrypt.hash(body.password, 12),
          nom: body.nom,
          prenom: body.prenom,
          roles: ["KHOLLEUR"],
          competences: { create: body.disciplineIds.map((disciplineId) => ({ disciplineId })) },
        },
      });

  return NextResponse.json(kholleur, { status: 201 });
}
