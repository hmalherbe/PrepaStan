import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { envoyerEmailsValidationReferents } from "@/lib/notificationsPlanning";

// POST /api/admin/planification/:classeId/:semaine/renvoyer-validation-referents
// Renvoie aux professeurs référents concernés l'email "grilles validées,
// vous pouvez valider" pour toutes les disciplines déjà publiées de cette
// (classe, semaine) dont les grilles kholleur sont déjà toutes validées et
// qui ne sont pas encore clôturées. Utile si un référent dit n'avoir rien
// reçu, ou pour une relance groupée. N'écrit rien en base, ne change aucun
// statut.
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

  const referentsNotifies = await envoyerEmailsValidationReferents(sessions.map((s) => s.id));
  return NextResponse.json({ referentsNotifies });
}
