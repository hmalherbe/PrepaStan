import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE /api/admin/referents/personne/:utilisateurId
// Retire le rôle référent d'une personne pour toutes ses classes/disciplines
// d'un coup (contrairement à DELETE /api/admin/referents/:referentId, qui ne
// retire qu'une seule assignation). Si cette personne n'a pas d'autre rôle
// (ex. pas aussi khôlleur), son compte est supprimé entièrement ; sinon,
// seul le rôle référent et ses assignations disparaissent.
export async function DELETE(_req: Request, { params }: { params: Promise<{ utilisateurId: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { utilisateurId } = await params;

  try {
    const utilisateur = await prisma.utilisateur.findUniqueOrThrow({ where: { id: utilisateurId } });
    const autresRoles = utilisateur.roles.filter((r) => r !== "PROFESSEUR_REFERENT");

    await prisma.$transaction(
      autresRoles.length > 0
        ? [
            prisma.professeurReferent.deleteMany({ where: { utilisateurId } }),
            prisma.utilisateur.update({ where: { id: utilisateurId }, data: { roles: autresRoles } }),
          ]
        : [
            prisma.professeurReferent.deleteMany({ where: { utilisateurId } }),
            prisma.utilisateur.delete({ where: { id: utilisateurId } }),
          ]
    );
  } catch {
    return NextResponse.json(
      { error: "Impossible de supprimer ce référent." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
