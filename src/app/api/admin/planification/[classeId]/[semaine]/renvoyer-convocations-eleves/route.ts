import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { envoyerEmailsConvocationsEleves } from "@/lib/notificationsPlanning";

// Corps optionnel : liste des élèves à notifier parmi ceux concernés
// (sélection partielle depuis RenvoiAvecSelectionModal). Absent ou vide =
// tous les élèves concernés, comportement historique inchangé.
const bodySchema = z.object({ eleveIds: z.array(z.string()).optional() });

// POST /api/admin/planification/:classeId/:semaine/renvoyer-convocations-eleves
// Renvoie à chaque élève concerné (ou seulement ceux de `eleveIds` si
// fourni, compte de connexion requis) sa convocation pour TOUTES les
// disciplines déjà publiées de cette (classe, semaine) — pas seulement
// celles publiées le plus récemment (contrairement à /publier). Utile si un
// élève dit n'avoir rien reçu, ou pour une relance groupée ou ciblée.
// N'écrit rien en base, ne change aucun statut.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ classeId: string; semaine: string }> }
) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { classeId, semaine } = await params;
  const { eleveIds } = bodySchema.parse(await req.json());

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

  const elevesNotifies = await envoyerEmailsConvocationsEleves(
    sessions.map((s) => s.id),
    Number(semaine),
    eleveIds?.length ? eleveIds : undefined
  );
  return NextResponse.json({ elevesNotifies });
}
