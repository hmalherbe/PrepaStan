import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/eleves
// Liste de tous les élèves, toutes classes confondues (écran "Étudiants").
export async function GET() {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const eleves = await prisma.eleve.findMany({
    include: { classe: { select: { id: true, nom: true } }, utilisateur: { select: { email: true } } },
    orderBy: [{ classe: { nom: "asc" } }, { nom: "asc" }],
  });

  return NextResponse.json(eleves);
}

const bodySchema = z
  .object({
    nom: z.string().min(1),
    prenom: z.string().min(1),
    classeId: z.string().min(1),
    // LV1/LV2 : disciplines marquées Discipline.estLangueVivante. LV2 peut
    // rester vide, mais si les deux sont renseignées elles doivent différer.
    lv1Id: z.string().min(1).optional(),
    lv2Id: z.string().min(1).optional(),
    // Si fourni, crée aussi un compte de connexion ELEVE pour cet élève.
    email: z.string().email().optional(),
    password: z.string().min(4).optional(),
  })
  .refine((b) => !b.lv1Id || !b.lv2Id || b.lv1Id !== b.lv2Id, {
    message: "LV1 et LV2 doivent être différentes",
    path: ["lv2Id"],
  });

// POST /api/admin/eleves
// Crée un élève dans la classe choisie, avec un compte de connexion optionnel.
export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const body = bodySchema.parse(await req.json());

  let utilisateurId: string | undefined;
  if (body.email && body.password) {
    const utilisateur = await prisma.utilisateur.create({
      data: {
        email: body.email,
        password: await bcrypt.hash(body.password, 12),
        nom: body.nom,
        prenom: body.prenom,
        role: "ELEVE",
      },
    });
    utilisateurId = utilisateur.id;
  }

  const eleve = await prisma.eleve.create({
    data: {
      nom: body.nom,
      prenom: body.prenom,
      classeId: body.classeId,
      lv1Id: body.lv1Id,
      lv2Id: body.lv2Id,
      utilisateurId,
    },
    include: { classe: { select: { id: true, nom: true } } },
  });

  return NextResponse.json(eleve, { status: 201 });
}
