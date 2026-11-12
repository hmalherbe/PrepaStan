import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z
  .object({
    passageId1: z.string().min(1),
    passageId2: z.string().min(1),
  })
  .refine((b) => b.passageId1 !== b.passageId2, { message: "Les deux élèves sélectionnés sont identiques" });

// POST /api/admin/planification/passages/echanger
// Intervertit deux élèves entre deux créneaux de la MÊME session (classe +
// discipline + semaine) — ex. deux élèves qui veulent échanger leur horaire
// de khôlle. Interdit entre deux disciplines différentes : chaque élève
// perdrait sinon sa khôlle de la discipline qu'il quitte sans compensation,
// cassant le quota de la semaine. Refusé aussi une fois une note déjà
// saisie pour l'un des deux (ne jamais réattribuer une note déjà donnée à
// quelqu'un d'autre), ou la session clôturée (comme l'édition de créneau).
export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const { passageId1, passageId2 } = bodySchema.parse(await req.json());

  const [passage1, passage2] = await Promise.all([
    prisma.passage.findUnique({
      where: { id: passageId1 },
      include: { note: { select: { valeur: true, absent: true } }, creneau: { include: { sessionKholle: true } } },
    }),
    prisma.passage.findUnique({
      where: { id: passageId2 },
      include: { note: { select: { valeur: true, absent: true } }, creneau: { include: { sessionKholle: true } } },
    }),
  ]);

  if (!passage1 || !passage2) {
    return NextResponse.json({ error: "Élève introuvable" }, { status: 404 });
  }

  if (passage1.creneau.sessionKholleId !== passage2.creneau.sessionKholleId) {
    return NextResponse.json(
      { error: "Impossible d'intervertir deux élèves de disciplines différentes" },
      { status: 409 }
    );
  }

  if (passage1.creneau.sessionKholle.statut === "CLOTUREE") {
    return NextResponse.json(
      { error: "Session déjà clôturée (notes validées) : plus d'interversion possible" },
      { status: 409 }
    );
  }

  if (
    passage1.note?.valeur != null ||
    passage1.note?.absent ||
    passage2.note?.valeur != null ||
    passage2.note?.absent
  ) {
    return NextResponse.json(
      { error: "Impossible d'intervertir : une note (ou une absence) a déjà été saisie pour au moins un des deux élèves" },
      { status: 409 }
    );
  }

  // Chaque élève change d'horaire en rejoignant le créneau de l'autre : il
  // faut revérifier qu'il n'est pas déjà occupé à ce moment-là par une
  // AUTRE khôlle de sa semaine (en excluant le créneau qu'il quitte), même
  // logique prep-incluse que l'édition manuelle d'un créneau (voir
  // creneaux/[id]/route.ts).
  type CreneauAvecSession = NonNullable<typeof passage1>["creneau"];
  async function conflitPourEleve(
    eleveId: string,
    creneauCible: CreneauAvecSession,
    creneauQuitte: string
  ): Promise<boolean> {
    const debutOccupation = creneauCible.heureDebutPreparation ?? creneauCible.heureDebut;
    const chevauchants = await prisma.creneau.findMany({
      where: {
        id: { not: creneauQuitte },
        date: creneauCible.date,
        passages: { some: { eleveId } },
        heureFin: { gt: debutOccupation },
        OR: [
          { heureDebutPreparation: { lt: creneauCible.heureFin } },
          { heureDebutPreparation: null, heureDebut: { lt: creneauCible.heureFin } },
        ],
      },
      select: { id: true },
    });
    return chevauchants.length > 0;
  }

  const [conflit1, conflit2] = await Promise.all([
    conflitPourEleve(passage1.eleveId, passage2.creneau, passage1.creneauId),
    conflitPourEleve(passage2.eleveId, passage1.creneau, passage2.creneauId),
  ]);

  if (conflit1 || conflit2) {
    return NextResponse.json(
      { error: "Interversion impossible : l'un des deux élèves a déjà une autre khôlle à ce moment-là" },
      { status: 409 }
    );
  }

  await prisma.$transaction([
    prisma.passage.update({ where: { id: passage1.id }, data: { creneauId: passage2.creneauId } }),
    prisma.passage.update({ where: { id: passage2.id }, data: { creneauId: passage1.creneauId } }),
  ]);

  return NextResponse.json({ ok: true });
}
