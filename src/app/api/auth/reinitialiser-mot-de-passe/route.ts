import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hasherToken } from "@/lib/resetToken";

const bodySchema = z.object({
  token: z.string().min(1),
  motDePasse: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères."),
});

// POST /api/auth/reinitialiser-mot-de-passe
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ erreur: parsed.error.issues[0]?.message ?? "Requête invalide." }, { status: 400 });
  }
  const { token, motDePasse } = parsed.data;

  const enregistrement = await prisma.tokenReinitialisationMotDePasse.findUnique({
    where: { tokenHash: hasherToken(token) },
  });

  if (!enregistrement || enregistrement.expiration < new Date()) {
    return NextResponse.json({ erreur: "Lien invalide ou expiré." }, { status: 400 });
  }

  const motDePasseHache = await bcrypt.hash(motDePasse, 12);

  await prisma.$transaction([
    prisma.utilisateur.update({
      where: { id: enregistrement.utilisateurId },
      data: { password: motDePasseHache },
    }),
    // Le lien ne doit servir qu'une seule fois ; on purge aussi les autres
    // tokens éventuels du même utilisateur (redemande faite entre-temps).
    prisma.tokenReinitialisationMotDePasse.deleteMany({ where: { utilisateurId: enregistrement.utilisateurId } }),
  ]);

  return NextResponse.json({ ok: true });
}
