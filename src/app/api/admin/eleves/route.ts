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

// DELETE /api/admin/eleves
// Supprime tous les élèves, toutes classes et années scolaires confondues
// — sauf ceux ayant déjà des passages de khôlle enregistrés (même garde-fou
// qu'une suppression individuelle, voir [eleveId]/route.ts) : un vrai
// historique de notes n'est jamais perdu silencieusement, même en masse.
export async function DELETE() {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const eleves = await prisma.eleve.findMany({
    select: { id: true, passages: { select: { id: true }, take: 1 } },
  });
  const supprimables = eleves.filter((e) => e.passages.length === 0).map((e) => e.id);
  const proteges = eleves.length - supprimables.length;

  const { count } = await prisma.eleve.deleteMany({ where: { id: { in: supprimables } } });

  return NextResponse.json({ supprimes: count, proteges });
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
    // Coordonnées/origine, informationnelles uniquement (voir schema.prisma).
    emailContact: z.string().email().optional(),
    telephone: z.string().optional(),
    numeroParcoursup: z.string().optional(),
    etablissementOrigine: z.string().optional(),
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
        roles: ["ELEVE"],
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
      emailContact: body.emailContact,
      telephone: body.telephone,
      numeroParcoursup: body.numeroParcoursup,
      etablissementOrigine: body.etablissementOrigine,
    },
    include: { classe: { select: { id: true, nom: true } } },
  });

  return NextResponse.json(eleve, { status: 201 });
}
