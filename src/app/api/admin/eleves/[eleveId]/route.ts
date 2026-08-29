import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE /api/admin/eleves/:eleveId
export async function DELETE(_req: Request, { params }: { params: Promise<{ eleveId: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { eleveId } = await params;

  try {
    await prisma.eleve.delete({ where: { id: eleveId } });
  } catch {
    return NextResponse.json(
      { error: "Impossible de supprimer un élève qui a déjà des passages de khôlle enregistrés" },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}

const bodySchema = z
  .object({
    nom: z.string().min(1),
    prenom: z.string().min(1),
    classeId: z.string().min(1),
    // LV1/LV2 : disciplines marquées Discipline.estLangueVivante. LV2 peut
    // rester vide, mais si les deux sont renseignées elles doivent différer.
    lv1Id: z.string().min(1).optional(),
    lv2Id: z.string().min(1).optional(),
    // Si fourni sans compte existant, en crée un. Si fourni avec un compte
    // existant, met à jour son email. Mot de passe optionnel dans les deux cas
    // (obligatoire seulement à la création du compte).
    email: z.string().email().optional(),
    password: z.string().min(4).optional(),
  })
  .refine((b) => !b.lv1Id || !b.lv2Id || b.lv1Id !== b.lv2Id, {
    message: "LV1 et LV2 doivent être différentes",
    path: ["lv2Id"],
  });

// PUT /api/admin/eleves/:eleveId
// Peut aussi déplacer l'élève vers une autre classe (classeId).
export async function PUT(req: Request, { params }: { params: Promise<{ eleveId: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { eleveId } = await params;

  const body = bodySchema.parse(await req.json());
  const eleveExistant = await prisma.eleve.findUniqueOrThrow({ where: { id: eleveId } });

  try {
    const eleve = await prisma.$transaction(async (tx) => {
      if (eleveExistant.utilisateurId) {
        if (body.email) {
          await tx.utilisateur.update({
            where: { id: eleveExistant.utilisateurId },
            data: {
              nom: body.nom,
              prenom: body.prenom,
              email: body.email,
              ...(body.password ? { password: await bcrypt.hash(body.password, 12) } : {}),
            },
          });
        }
      } else if (body.email && body.password) {
        const utilisateur = await tx.utilisateur.create({
          data: {
            email: body.email,
            password: await bcrypt.hash(body.password, 12),
            nom: body.nom,
            prenom: body.prenom,
            roles: ["ELEVE"],
          },
        });
        await tx.eleve.update({ where: { id: eleveId }, data: { utilisateurId: utilisateur.id } });
      }
      return tx.eleve.update({
        where: { id: eleveId },
        data: {
          nom: body.nom,
          prenom: body.prenom,
          classeId: body.classeId,
          lv1Id: body.lv1Id ?? null,
          lv2Id: body.lv2Id ?? null,
        },
        include: { classe: { select: { id: true, nom: true } } },
      });
    });
    return NextResponse.json(eleve);
  } catch {
    return NextResponse.json({ error: "Un compte avec cet email existe déjà" }, { status: 409 });
  }
}
