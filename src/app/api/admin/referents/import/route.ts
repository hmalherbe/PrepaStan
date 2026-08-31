import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ANNEE_SCOLAIRE_COOKIE, anneeScolaireCourante } from "@/lib/anneeScolaire";
import { requireRole } from "@/lib/auth";
import { parserCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

const MOT_DE_PASSE_DEFAUT = "demo1234";

const bodySchema = z.object({ csv: z.string().min(1) });

// POST /api/admin/referents/import
// Colonnes attendues : classe, discipline, nom, prenom, email. La classe
// doit déjà exister pour l'année scolaire actuellement sélectionnée ; la
// discipline est automatiquement assignée à cette classe si ce n'était pas
// déjà fait (ClasseDiscipline), comme scripts/import-legacy-data.ts. Si
// l'email correspond déjà à un compte existant (ex. khôlleur), ajoute
// simplement le rôle PROFESSEUR_REFERENT à ce compte.
export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const { csv } = bodySchema.parse(await req.json());
  const lignes = parserCsv(csv);

  const cookieStore = await cookies();
  const anneeScolaireLibelle = cookieStore.get(ANNEE_SCOLAIRE_COOKIE)?.value ?? anneeScolaireCourante();
  const anneeScolaire = await prisma.anneeScolaire.findUnique({ where: { libelle: anneeScolaireLibelle } });

  const [classes, disciplines] = await Promise.all([
    anneeScolaire ? prisma.classe.findMany({ where: { anneeScolaireId: anneeScolaire.id } }) : [],
    prisma.discipline.findMany(),
  ]);
  const classeParNom = new Map(classes.map((c) => [c.nom.toLowerCase(), c]));
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
    const classeNom = l.classe;
    const disciplineNom = l.discipline;
    if (!nom || !prenom || !email || !classeNom || !disciplineNom) {
      erreurs.push({ ligne: numeroLigne, message: "Colonnes classe/discipline/nom/prenom/email obligatoires" });
      continue;
    }
    const classe = classeParNom.get(classeNom.toLowerCase());
    if (!classe) {
      erreurs.push({
        ligne: numeroLigne,
        message: `Classe "${classeNom}" introuvable pour l'année scolaire ${anneeScolaireLibelle}`,
      });
      continue;
    }
    const discipline = disciplineParNom.get(disciplineNom.toLowerCase());
    if (!discipline) {
      erreurs.push({ ligne: numeroLigne, message: `Discipline "${disciplineNom}" introuvable` });
      continue;
    }

    await prisma.classeDiscipline.upsert({
      where: { classeId_disciplineId: { classeId: classe.id, disciplineId: discipline.id } },
      update: {},
      create: { classeId: classe.id, disciplineId: discipline.id },
    });

    const existantCompte = await prisma.utilisateur.findUnique({ where: { email } });
    let utilisateurId: string;
    if (existantCompte) {
      utilisateurId = existantCompte.id;
      if (!existantCompte.roles.includes("PROFESSEUR_REFERENT")) {
        await prisma.utilisateur.update({
          where: { id: existantCompte.id },
          data: { roles: [...existantCompte.roles, "PROFESSEUR_REFERENT"] },
        });
      }
    } else {
      const cree = await prisma.utilisateur.create({
        data: { email, password: await bcrypt.hash(MOT_DE_PASSE_DEFAUT, 12), nom, prenom, roles: ["PROFESSEUR_REFERENT"] },
      });
      utilisateurId = cree.id;
    }

    const referentExistant = await prisma.professeurReferent.findUnique({
      where: {
        classeId_disciplineId_utilisateurId: { classeId: classe.id, disciplineId: discipline.id, utilisateurId },
      },
    });
    if (referentExistant) {
      misAJour++;
    } else {
      await prisma.professeurReferent.create({ data: { classeId: classe.id, disciplineId: discipline.id, utilisateurId } });
      crees++;
    }
  }

  return NextResponse.json({ total: lignes.length, crees, misAJour, erreurs });
}
