import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/kholleurs/:kholleurId
// Détail d'un kholleur : ses disponibilités et disciplines.
export async function GET(_req: Request, { params }: { params: Promise<{ kholleurId: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { kholleurId } = await params;

  const kholleur = await prisma.utilisateur.findUniqueOrThrow({
    where: { id: kholleurId },
    include: {
      competences: { include: { discipline: true } },
      disponibilites: { orderBy: [{ jourSemaine: "asc" }, { heureDebut: "asc" }] },
    },
  });

  return NextResponse.json(kholleur);
}

const bodySchema = z.object({
  nom: z.string().min(1),
  prenom: z.string().min(1),
  email: z.string().email(),
  // Optionnel : laisser vide pour ne pas changer le mot de passe existant.
  password: z.string().min(4).optional(),
  disciplineIds: z.array(z.string()).min(1),
});

// PUT /api/admin/kholleurs/:kholleurId
// Met à jour les informations du compte et synchronise ses compétences
// (disciplines qu'il peut kholler) avec la liste fournie.
export async function PUT(req: Request, { params }: { params: Promise<{ kholleurId: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { kholleurId } = await params;

  const body = bodySchema.parse(await req.json());

  try {
    const kholleur = await prisma.$transaction(async (tx) => {
      const utilisateur = await tx.utilisateur.update({
        where: { id: kholleurId },
        data: {
          nom: body.nom,
          prenom: body.prenom,
          email: body.email,
          ...(body.password ? { password: await bcrypt.hash(body.password, 12) } : {}),
        },
      });
      await tx.competence.deleteMany({ where: { kholleurId, disciplineId: { notIn: body.disciplineIds } } });
      for (const disciplineId of body.disciplineIds) {
        await tx.competence.upsert({
          where: { kholleurId_disciplineId: { kholleurId, disciplineId } },
          update: {},
          create: { kholleurId, disciplineId },
        });
      }
      return utilisateur;
    });
    return NextResponse.json(kholleur);
  } catch {
    return NextResponse.json({ error: "Un compte avec cet email existe déjà" }, { status: 409 });
  }
}

// DELETE /api/admin/kholleurs/:kholleurId
// Les compétences et disponibilités (pure configuration, sans valeur
// d'historique) sont nettoyées avant la suppression du compte. En
// revanche, la présence de créneaux déjà donnés ou d'un job de
// planification lancé par ce kholleur fait échouer toute l'opération
// (contrainte de clé étrangère, transaction annulée) : impossible de
// perdre silencieusement un historique réel de khôlles.
export async function DELETE(_req: Request, { params }: { params: Promise<{ kholleurId: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { kholleurId } = await params;

  try {
    await prisma.$transaction([
      prisma.competence.deleteMany({ where: { kholleurId } }),
      prisma.disponibilite.deleteMany({ where: { kholleurId } }),
      prisma.utilisateur.delete({ where: { id: kholleurId } }),
    ]);
  } catch {
    return NextResponse.json(
      {
        error:
          "Impossible de supprimer ce kholleur : il a déjà des créneaux de khôlle (planifiés ou passés) " +
          "enregistrés à son nom.",
      },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
