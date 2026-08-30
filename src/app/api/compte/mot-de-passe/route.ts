import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  motDePasseActuel: z.string().min(1),
  nouveauMotDePasse: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères."),
});

// PATCH /api/compte/mot-de-passe
// Change le mot de passe de l'utilisateur connecté (n'importe quel rôle).
export async function PATCH(req: Request) {
  const auth = await requireRole(["ADMIN", "KHOLLEUR", "PROFESSEUR_REFERENT", "ELEVE"]);
  if (auth instanceof NextResponse) return auth;

  const body = bodySchema.parse(await req.json());

  const utilisateur = await prisma.utilisateur.findUniqueOrThrow({ where: { id: auth.user.id } });

  const motDePasseValide = await bcrypt.compare(body.motDePasseActuel, utilisateur.password);
  if (!motDePasseValide) {
    return NextResponse.json({ error: "Mot de passe actuel incorrect." }, { status: 400 });
  }

  const nouveauHash = await bcrypt.hash(body.nouveauMotDePasse, 12);
  await prisma.utilisateur.update({ where: { id: auth.user.id }, data: { password: nouveauHash } });

  return NextResponse.json({ ok: true });
}
