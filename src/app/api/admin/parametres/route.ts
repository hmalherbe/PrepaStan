import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { dureesParDefaut } from "@/lib/parametresDiscipline";
import { prisma } from "@/lib/prisma";

// GET /api/admin/parametres?classeId=...
// Durées de préparation/khôlle pour chaque discipline assignée à la classe,
// complétées par une valeur par défaut (voir dureesParDefaut) pour toute
// discipline sans ligne ParametreDiscipline explicite.
export async function GET(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const classeId = new URL(req.url).searchParams.get("classeId");
  if (!classeId) return NextResponse.json({ error: "classeId requis" }, { status: 400 });

  const [classeDisciplines, parametres] = await Promise.all([
    prisma.classeDiscipline.findMany({
      where: { classeId },
      include: { discipline: true },
      orderBy: { discipline: { nom: "asc" } },
    }),
    prisma.parametreDiscipline.findMany({ where: { classeId } }),
  ]);
  const parametreParDiscipline = new Map(parametres.map((p) => [p.disciplineId, p]));

  const resultat = classeDisciplines.map((cd) => {
    const existant = parametreParDiscipline.get(cd.disciplineId);
    const defaut = dureesParDefaut(cd.discipline.estLangueVivante);
    return {
      disciplineId: cd.disciplineId,
      disciplineNom: cd.discipline.nom,
      dureePreparationMinutes: existant?.dureePreparationMinutes ?? defaut.dureePreparationMinutes,
      dureeKholleMinutes: existant?.dureeKholleMinutes ?? defaut.dureeKholleMinutes,
    };
  });

  return NextResponse.json(resultat);
}

const bodySchema = z.object({
  classeId: z.string().min(1),
  parametres: z.array(
    z.object({
      disciplineId: z.string().min(1),
      dureePreparationMinutes: z.number().int().min(1).max(240),
      dureeKholleMinutes: z.number().int().min(1).max(240),
    })
  ),
});

// PUT /api/admin/parametres
// Enregistre en une fois les durées de toutes les disciplines d'une classe
// (voir écran Paramètres).
export async function PUT(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const body = bodySchema.parse(await req.json());

  await Promise.all(
    body.parametres.map((p) =>
      prisma.parametreDiscipline.upsert({
        where: { classeId_disciplineId: { classeId: body.classeId, disciplineId: p.disciplineId } },
        update: { dureePreparationMinutes: p.dureePreparationMinutes, dureeKholleMinutes: p.dureeKholleMinutes },
        create: {
          classeId: body.classeId,
          disciplineId: p.disciplineId,
          dureePreparationMinutes: p.dureePreparationMinutes,
          dureeKholleMinutes: p.dureeKholleMinutes,
        },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
