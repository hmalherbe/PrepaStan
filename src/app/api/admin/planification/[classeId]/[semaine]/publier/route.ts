import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { envoyerEmailsConvocationsEleves, envoyerEmailsPlanningKholleurs } from "@/lib/notificationsPlanning";

// POST /api/admin/planification/:classeId/:semaine/publier
// Passe toutes les SessionKholle du brouillon en PLANIFIEE : les créneaux
// deviennent visibles pour les kholleurs concernés, qui reçoivent en plus un
// email récapitulatif de leurs créneaux pour la semaine, et pour les élèves
// concernés, qui reçoivent leur convocation (jour, kholleur, horaires de
// préparation/passage, salle).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ classeId: string; semaine: string }> }
) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { classeId, semaine } = await params;

  const sessionsAPublier = await prisma.sessionKholle.findMany({
    where: { classeId, semaine: Number(semaine), statut: "PLANIFICATION" },
    select: { id: true },
  });

  if (sessionsAPublier.length === 0) {
    return NextResponse.json({ sessionsPubliees: 0 });
  }

  const sessionIds = sessionsAPublier.map((s) => s.id);

  await prisma.sessionKholle.updateMany({
    where: { id: { in: sessionIds } },
    data: { statut: "PLANIFIEE" },
  });

  await envoyerEmailsPlanningKholleurs(sessionIds, Number(semaine));
  await envoyerEmailsConvocationsEleves(sessionIds, Number(semaine));

  return NextResponse.json({ sessionsPubliees: sessionIds.length });
}
