import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listerDestinatairesEleves } from "@/lib/notificationsPlanning";

// GET /api/admin/planification/:classeId/:semaine/destinataires-eleves
// Liste les élèves (compte de connexion requis) qui recevraient l'email
// s'ils étaient tous sélectionnés pour un "Renvoyer convocation aux
// étudiants" — sert la fenêtre de sélection des destinataires avant envoi
// (voir RenvoiAvecSelectionModal). Couvre toutes les disciplines déjà
// publiées de cette (classe, semaine), pas seulement la dernière
// publication.
export async function GET(
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

  const destinataires = await listerDestinatairesEleves(sessions.map((s) => s.id));
  return NextResponse.json({ destinataires });
}
