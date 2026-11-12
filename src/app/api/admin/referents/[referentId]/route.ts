import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { compteExistantAvecEmailDifferent, messageCompteEmailDifferent } from "@/lib/coherenceCompte";
import { prisma } from "@/lib/prisma";

// DELETE /api/admin/referents/:referentId
// Retire une seule assignation (classe, discipline). Si c'était la toute
// dernière assignation référent de cette personne, retire aussi le rôle
// PROFESSEUR_REFERENT — et supprime le compte s'il ne lui reste aucun autre
// rôle (ex. pas khôlleur) — pour ne pas laisser un rôle « fantôme » sans
// aucune assignation derrière lui.
export async function DELETE(_req: Request, { params }: { params: Promise<{ referentId: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { referentId } = await params;

  const assignation = await prisma.professeurReferent.findUniqueOrThrow({ where: { id: referentId } });

  const autresAssignations = await prisma.professeurReferent.count({
    where: { utilisateurId: assignation.utilisateurId, id: { not: referentId } },
  });

  if (autresAssignations > 0) {
    await prisma.professeurReferent.delete({ where: { id: referentId } });
  } else {
    const utilisateur = await prisma.utilisateur.findUniqueOrThrow({ where: { id: assignation.utilisateurId } });
    const autresRoles = utilisateur.roles.filter((r) => r !== "PROFESSEUR_REFERENT");
    await prisma.$transaction(
      autresRoles.length > 0
        ? [
            prisma.professeurReferent.delete({ where: { id: referentId } }),
            prisma.utilisateur.update({ where: { id: utilisateur.id }, data: { roles: autresRoles } }),
          ]
        : [
            prisma.professeurReferent.delete({ where: { id: referentId } }),
            prisma.utilisateur.delete({ where: { id: utilisateur.id } }),
          ]
    );
  }
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

  const doublon = await compteExistantAvecEmailDifferent(
    body.nom,
    body.prenom,
    body.email,
    referentExistant.utilisateurId
  );
  if (doublon) {
    return NextResponse.json(
      { error: messageCompteEmailDifferent(body.nom, body.prenom, doublon.email) },
      { status: 409 }
    );
  }

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
