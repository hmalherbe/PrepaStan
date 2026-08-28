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

// Soit un compte déjà existant (utilisateurId), soit les informations pour
// en créer un nouveau (nom/prenom/email/password) — un même professeur
// référent peut ainsi être assigné à plusieurs classes sans dupliquer son
// compte de connexion.
const bodySchema = z
  .object({
    utilisateurId: z.string().optional(),
    nom: z.string().min(1).optional(),
    prenom: z.string().min(1).optional(),
    email: z.string().email().optional(),
    password: z.string().min(4).optional(),
    disciplineId: z.string(),
    classeIds: z.array(z.string()).min(1),
  })
  .refine((b) => b.utilisateurId || (b.nom && b.prenom && b.email && b.password), {
    message: "Choisissez un compte existant ou renseignez nom/prénom/email/mot de passe",
  });

// POST /api/admin/referents
// Assigne un référent (existant ou nouvellement créé) à une ou plusieurs
// classes pour une discipline. La discipline doit déjà être assignée à
// chacune des classes choisies (ClasseDiscipline).
export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const body = bodySchema.parse(await req.json());

  const disciplinesAssignees = await prisma.classeDiscipline.findMany({
    where: { classeId: { in: body.classeIds }, disciplineId: body.disciplineId },
  });
  const classesManquantes = body.classeIds.filter(
    (id) => !disciplinesAssignees.some((da) => da.classeId === id)
  );
  if (classesManquantes.length > 0) {
    return NextResponse.json(
      { error: "Cette discipline n'est pas encore assignée à toutes les classes sélectionnées" },
      { status: 409 }
    );
  }

  try {
    const referents = await prisma.$transaction(async (tx) => {
      const utilisateurId =
        body.utilisateurId ??
        (
          await tx.utilisateur.create({
            data: {
              email: body.email!,
              password: await bcrypt.hash(body.password!, 12),
              nom: body.nom!,
              prenom: body.prenom!,
              role: "PROFESSEUR_REFERENT",
            },
          })
        ).id;

      return Promise.all(
        body.classeIds.map((classeId) =>
          tx.professeurReferent.create({
            data: { utilisateurId, classeId, disciplineId: body.disciplineId },
            include: { utilisateur: true, classe: true, discipline: true },
          })
        )
      );
    });
    return NextResponse.json(referents, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Ce référent est déjà assigné à l'une des classes sélectionnées pour cette discipline" },
      { status: 409 }
    );
  }
}
