import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { parserCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({ csv: z.string().min(1) });

// POST /api/admin/salles/import
// Colonne attendue (insensible à la casse) : nom. Une salle déjà présente
// (même nom) est simplement ignorée plutôt que dupliquée.
export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const { csv } = bodySchema.parse(await req.json());
  const lignes = parserCsv(csv);

  const sallesExistantes = await prisma.salle.findMany({ select: { nom: true } });
  const nomsExistants = new Set(sallesExistantes.map((s) => s.nom.toLowerCase()));

  let crees = 0;
  let misAJour = 0;
  const erreurs: { ligne: number; message: string }[] = [];

  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    const numeroLigne = i + 2;

    const nom = l.nom;
    if (!nom) {
      erreurs.push({ ligne: numeroLigne, message: "Colonne nom obligatoire" });
      continue;
    }

    if (nomsExistants.has(nom.toLowerCase())) {
      misAJour++;
      continue;
    }

    await prisma.salle.create({ data: { nom } });
    nomsExistants.add(nom.toLowerCase());
    crees++;
  }

  return NextResponse.json({ total: lignes.length, crees, misAJour, erreurs });
}
