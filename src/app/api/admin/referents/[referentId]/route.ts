import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE /api/admin/referents/:referentId
// Retire l'assignation référent (le compte utilisateur n'est pas supprimé).
export async function DELETE(_req: Request, { params }: { params: Promise<{ referentId: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { referentId } = await params;

  await prisma.professeurReferent.delete({ where: { id: referentId } });
  return NextResponse.json({ ok: true });
}

const bodySchema = z.object({
  nom: z.string().min(1),
  prenom: z.string().min(1),
  email: z.string().email(),
  // Optionnel : laisser vide pour ne pas changer le mot de passe existant.
  password: z.string().min(4).optional(),
  classeId: z.string(),
  disciplineId: z.string(),
});

// PUT /api/admin/referents/:referentId
// Met à jour les informations du compte et peut réassigner le référent à
// une autre classe/discipline (la discipline doit déjà être assignée à
// cette classe).
export async function PUT(req: Request, { params }: { params: Promise<{ referentId: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { referentId } = await params;

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

  const referentExistant = await prisma.professeurReferent.findUniqueOrThrow({ where: { id: referentId } });

  try {
    const referent = await prisma.$transaction(async (tx) => {
      await tx.utilisateur.update({
        where: { id: referentExistant.utilisateurId },
        data: {
          nom: body.nom,
          prenom: body.prenom,
          email: body.email,
          ...(body.password ? { password: await bcrypt.hash(body.password, 12) } : {}),
        },
      });
      return tx.professeurReferent.update({
        where: { id: referentId },
        data: { classeId: body.classeId, disciplineId: body.disciplineId },
        include: { utilisateur: true, classe: true, discipline: true },
      });
    });
    return NextResponse.json(referent);
  } catch {
    return NextResponse.json(
      { error: "Un référent est déjà assigné à cette classe pour cette discipline, ou cet email est déjà pris" },
      { status: 409 }
    );
  }
}
