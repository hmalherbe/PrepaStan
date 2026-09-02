import { NextResponse } from "next/server";
import { z } from "zod";
import { envoyerEmailReinitialisationMotDePasse } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { DUREE_VALIDITE_TOKEN_MS, genererToken, hasherToken } from "@/lib/resetToken";

const bodySchema = z.object({ email: z.string().email() });

// POST /api/auth/mot-de-passe-oublie
// Répond toujours { ok: true }, que l'email corresponde à un compte ou non
// — révéler l'inexistence d'un compte permettrait à quiconque de vérifier
// si telle adresse est inscrite sur PrepaStan.
export async function POST(req: Request) {
  const { email } = bodySchema.parse(await req.json());

  const utilisateur = await prisma.utilisateur.findUnique({ where: { email } });
  if (utilisateur) {
    const token = genererToken();
    await prisma.$transaction([
      // Un seul lien valide à la fois : les précédents (non utilisés)
      // deviennent inutilisables dès qu'une nouvelle demande est faite.
      prisma.tokenReinitialisationMotDePasse.deleteMany({ where: { utilisateurId: utilisateur.id } }),
      prisma.tokenReinitialisationMotDePasse.create({
        data: {
          utilisateurId: utilisateur.id,
          tokenHash: hasherToken(token),
          expiration: new Date(Date.now() + DUREE_VALIDITE_TOKEN_MS),
        },
      }),
    ]);

    const base = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
    const lien = `${base}/reinitialiser-mot-de-passe?token=${token}`;
    await envoyerEmailReinitialisationMotDePasse({
      destinataire: utilisateur.email,
      nomUtilisateur: utilisateur.prenom,
      lien,
    });
  }

  return NextResponse.json({ ok: true });
}
