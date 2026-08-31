import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { parserCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

const MOT_DE_PASSE_DEFAUT = "demo1234";

const bodySchema = z.object({ csv: z.string().min(1) });

// POST /api/admin/kholleurs/import
// Colonnes attendues : nom, prenom, email, disciplines (une ou plusieurs,
// séparées par ";" ou ",", ex. "Maths;Anglais"). Si l'email correspond déjà
// à un compte existant (ex. professeur référent), ajoute simplement le rôle
// KHOLLEUR à ce compte au lieu d'en créer un second, et fusionne ses
// compétences avec celles déjà déclarées (aucune n'est retirée).
export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const { csv } = bodySchema.parse(await req.json());
  const lignes = parserCsv(csv);

  const disciplines = await prisma.discipline.findMany();
  const disciplineParNom = new Map(disciplines.map((d) => [d.nom.toLowerCase(), d]));

  let crees = 0;
  let misAJour = 0;
  const erreurs: { ligne: number; message: string }[] = [];

  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    const numeroLigne = i + 2;

    const nom = l.nom;
    const prenom = l.prenom;
    const email = l.email;
    const disciplinesTexte = l.disciplines || l.discipline;
    if (!nom || !prenom || !email || !disciplinesTexte) {
      erreurs.push({ ligne: numeroLigne, message: "Colonnes nom/prenom/email/disciplines obligatoires" });
      continue;
    }

    const nomsDisciplines = disciplinesTexte
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const disciplineIds: string[] = [];
    const disciplinesInconnues: string[] = [];
    for (const nomDiscipline of nomsDisciplines) {
      const d = disciplineParNom.get(nomDiscipline.toLowerCase());
      if (d) disciplineIds.push(d.id);
      else disciplinesInconnues.push(nomDiscipline);
    }
    if (disciplinesInconnues.length > 0) {
      erreurs.push({ ligne: numeroLigne, message: `Discipline(s) introuvable(s) : ${disciplinesInconnues.join(", ")}` });
      continue;
    }

    const existant = await prisma.utilisateur.findUnique({ where: { email } });
    let kholleurId: string;
    if (existant) {
      kholleurId = existant.id;
      if (!existant.roles.includes("KHOLLEUR")) {
        await prisma.utilisateur.update({ where: { id: existant.id }, data: { roles: [...existant.roles, "KHOLLEUR"] } });
      }
      misAJour++;
    } else {
      const cree = await prisma.utilisateur.create({
        data: { email, password: await bcrypt.hash(MOT_DE_PASSE_DEFAUT, 12), nom, prenom, roles: ["KHOLLEUR"] },
      });
      kholleurId = cree.id;
      crees++;
    }

    for (const disciplineId of disciplineIds) {
      await prisma.competence.upsert({
        where: { kholleurId_disciplineId: { kholleurId, disciplineId } },
        update: {},
        create: { kholleurId, disciplineId },
      });
    }
  }

  return NextResponse.json({ total: lignes.length, crees, misAJour, erreurs });
}
