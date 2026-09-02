import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  delaiEnvoiMailsNotationJours: z.number().int().min(0).max(60),
  modeleEmailKholleur: z.string().max(5000),
  modeleEmailReferent: z.string().max(5000),
  modeleEmailEleve: z.string().max(5000),
});

// PUT /api/admin/parametres-generaux
// Réglages globaux de l'application (table à une seule ligne, voir
// ParametresApplication dans le schéma).
export async function PUT(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const body = bodySchema.parse(await req.json());

  await prisma.parametresApplication.upsert({
    where: { id: "singleton" },
    update: body,
    create: { id: "singleton", ...body },
  });

  return NextResponse.json({ ok: true });
}
