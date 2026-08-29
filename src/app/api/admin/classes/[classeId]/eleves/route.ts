import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  nom: z.string().min(1),
  prenom: z.string().min(1),
  // Si fourni, crée aussi un compte de connexion ELEVE pour cet élève.
  email: z.string().email().optional(),
  password: z.string().min(4).optional(),
});

// POST /api/admin/classes/:classeId/eleves
// Ajoute un élève à la classe, avec un compte de connexion optionnel.
export async function POST(req: Request, { params }: { params: Promise<{ classeId: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { classeId } = await params;

  const body = bodySchema.parse(await req.json());

  let utilisateurId: string | undefined;
  if (body.email && body.password) {
    const utilisateur = await prisma.utilisateur.create({
      data: {
        email: body.email,
        password: await bcrypt.hash(body.password, 12),
        nom: body.nom,
        prenom: body.prenom,
        roles: ["ELEVE"],
      },
    });
    utilisateurId = utilisateur.id;
  }

  const eleve = await prisma.eleve.create({
    data: { nom: body.nom, prenom: body.prenom, classeId, utilisateurId },
  });

  return NextResponse.json(eleve, { status: 201 });
}
