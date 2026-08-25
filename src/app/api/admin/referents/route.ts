import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/referents
export async function GET() {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const referents = await prisma.professeurReferent.findMany({
    include: { utilisateur: true, discipline: true, classe: true },
    orderBy: [{ classe: { nom: "asc" } }],
  });

  return NextResponse.json(referents);
}

const bodySchema = z.object({
  nom: z.string().min(1),
  prenom: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(4),
  classeId: z.string(),
  disciplineId: z.string(),
});

// POST /api/admin/referents
// Crée un compte professeur référent et l'assigne à une classe+discipline.
// La discipline doit déjà être assignée à la classe (ClasseDiscipline).
export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const body = bodySchema.parse(await req.json());

  const disciplineAssignee = await prisma.classeDiscipline.findUnique({
    where: { classeId_disciplineId: { classeId: body.classeId, disciplineId: body.disciplineId } },
  });
  if (!disciplineAssignee) {
    return NextResponse.json(
      { error: "Cette discipline n'est pas encore assignée à cette classe" },
      { status: 409 }
    );
  }

  const utilisateur = await prisma.utilisateur.create({
    data: {
      email: body.email,
      password: await bcrypt.hash(body.password, 12),
      nom: body.nom,
      prenom: body.prenom,
      role: "PROFESSEUR_REFERENT",
    },
  });

  const referent = await prisma.professeurReferent.create({
    data: { utilisateurId: utilisateur.id, classeId: body.classeId, disciplineId: body.disciplineId },
  });

  return NextResponse.json(referent, { status: 201 });
}
