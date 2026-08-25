import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  jourSemaine: z.number().int().min(1).max(7), // 1 = lundi ... 7 = dimanche
  heureDebut: z.string().regex(/^\d{2}:\d{2}$/),
  heureFin: z.string().regex(/^\d{2}:\d{2}$/),
});

// POST /api/admin/kholleurs/:kholleurId/disponibilites
// Ajoute une disponibilité récurrente (par jour de la semaine).
export async function POST(req: Request, { params }: { params: Promise<{ kholleurId: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { kholleurId } = await params;

  const body = bodySchema.parse(await req.json());
  if (body.heureFin <= body.heureDebut) {
    return NextResponse.json({ error: "L'heure de fin doit être après l'heure de début" }, { status: 400 });
  }

  const disponibilite = await prisma.disponibilite.create({
    data: { kholleurId, jourSemaine: body.jourSemaine, heureDebut: body.heureDebut, heureFin: body.heureFin },
  });

  return NextResponse.json(disponibilite, { status: 201 });
}
