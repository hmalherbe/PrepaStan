import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { envoyerEmailsConvocationsEleves } from "@/lib/notificationsPlanning";

// POST /api/admin/planification/:classeId/:semaine/renvoyer-convocations-eleves
// Renvoie à chaque élève concerné (compte de connexion requis) sa
// convocation pour TOUTES les disciplines déjà publiées de cette (classe,
// semaine) — pas seulement celles publiées le plus récemment (contrairement
// à /publier). Utile si un élève dit n'avoir rien reçu, ou pour une relance
// groupée. N'écrit rien en base, ne change aucun statut.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ classeId: string; semaine: string }> }
) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { classeId, semaine } = await params;

  const sessions = await prisma.sessionKholle.findMany({
    where: { classeId, semaine: Number(semaine), statut: { not: "PLANIFICATION" } },
    select: { id: true },
  });

  if (sessions.length === 0) {
    return NextResponse.json(
      { error: "Rien à renvoyer : aucune discipline n'est encore publiée pour cette semaine" },
      { status: 409 }
    );
  }

  const elevesNotifies = await envoyerEmailsConvocationsEleves(sessions.map((s) => s.id), Number(semaine));
  return NextResponse.json({ elevesNotifies });
}
