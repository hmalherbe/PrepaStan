import { NextResponse } from "next/server";
import { z } from "zod";
import { envoyerActivationNouveauCompte, baseUrlDepuisRequete } from "@/lib/activationCompte";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({ utilisateurIds: z.array(z.string()).min(1) });

// POST /api/admin/envoi-identifiants
// (Re)envoie un email d'activation (lien à usage unique, 7 jours, voir
// envoyerActivationNouveauCompte) aux comptes sélectionnés depuis
// /admin/envoi-identifiants — qu'ils soient fraîchement créés ou déjà
// existants depuis longtemps. N'échoue jamais bruyamment par destinataire
// (voir envoyerActivationNouveauCompte), donc le compte renvoyé peut être
// inférieur au nombre de comptes demandés sans que ce soit une erreur.
export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const { utilisateurIds } = bodySchema.parse(await req.json());

  const utilisateurs = await prisma.utilisateur.findMany({
    where: { id: { in: utilisateurIds } },
    select: { id: true, email: true, prenom: true },
  });

  const baseUrl = baseUrlDepuisRequete(req);
  await Promise.allSettled(
    utilisateurs.map((u) =>
      envoyerActivationNouveauCompte({ utilisateurId: u.id, email: u.email, prenom: u.prenom, baseUrl })
    )
  );

  return NextResponse.json({ ok: true, count: utilisateurs.length });
}
