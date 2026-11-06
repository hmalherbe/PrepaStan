import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { envoyerEmailsPlanningKholleurs } from "@/lib/notificationsPlanning";

// Corps optionnel : liste des kholleurs à notifier parmi ceux concernés
// (sélection partielle depuis RenvoiAvecSelectionModal). Absent ou vide =
// tous les kholleurs concernés, comportement historique inchangé.
const bodySchema = z.object({ kholleurIds: z.array(z.string()).optional() });

// POST /api/admin/planification/:classeId/:semaine/renvoyer-planning-kholleurs
// Renvoie à chaque kholleur concerné (ou seulement ceux de `kholleurIds` si
// fourni) le récapitulatif de ses créneaux pour TOUTES les disciplines déjà
// publiées de cette (classe, semaine) — pas seulement celles publiées le
// plus récemment (contrairement à /publier, qui ne notifie que ce qu'il
// vient de publier). Utile si un kholleur dit n'avoir rien reçu, ou pour une
// relance groupée ou ciblée. N'écrit rien en base, ne change aucun statut.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ classeId: string; semaine: string }> }
) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { classeId, semaine } = await params;
  const { kholleurIds } = bodySchema.parse(await req.json());

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

  const kholleursNotifies = await envoyerEmailsPlanningKholleurs(
    sessions.map((s) => s.id),
    Number(semaine),
    kholleurIds?.length ? kholleurIds : undefined
  );
  return NextResponse.json({ kholleursNotifies });
}
