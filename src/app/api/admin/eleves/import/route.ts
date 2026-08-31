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

// POST /api/admin/eleves/import
// Colonnes attendues (insensible à la casse) : classe, nom, prenom, lv1,
// lv2, email — lv1/lv2/email optionnels. La classe doit déjà exister pour
// l'année scolaire actuellement sélectionnée (écran Classes). Si un email
// est fourni, crée aussi un compte de connexion ELEVE (mot de passe par
// défaut "demo1234", à changer ensuite via /compte) — même logique que
// scripts/import-legacy-data.ts, mais accessible depuis l'interface admin.
// Un élève déjà présent (même nom/prenom/classe) est mis à jour plutôt que
// dupliqué.
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
    prisma.discipline.findMany({ where: { estLangueVivante: true } }),
  ]);
  const classeParNom = new Map(classes.map((c) => [c.nom.toLowerCase(), c]));
  const disciplineParNom = new Map(disciplines.map((d) => [d.nom.toLowerCase(), d]));

  let crees = 0;
  let misAJour = 0;
  const erreurs: { ligne: number; message: string }[] = [];

  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    const numeroLigne = i + 2; // +1 pour l'en-tête, +1 pour l'index base 1

    const nom = l.nom;
    const prenom = l.prenom;
    const classeNom = l.classe;
    if (!nom || !prenom || !classeNom) {
      erreurs.push({ ligne: numeroLigne, message: "Colonnes classe/nom/prenom obligatoires" });
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

    let lv1Id: string | undefined;
    if (l.lv1) {
      const lv1 = disciplineParNom.get(l.lv1.toLowerCase());
      if (!lv1) {
        erreurs.push({ ligne: numeroLigne, message: `LV1 "${l.lv1}" introuvable ou n'est pas une langue vivante` });
        continue;
      }
      lv1Id = lv1.id;
    }
    let lv2Id: string | undefined;
    if (l.lv2) {
      const lv2 = disciplineParNom.get(l.lv2.toLowerCase());
      if (!lv2) {
        erreurs.push({ ligne: numeroLigne, message: `LV2 "${l.lv2}" introuvable ou n'est pas une langue vivante` });
        continue;
      }
      lv2Id = lv2.id;
    }
    if (lv1Id && lv2Id && lv1Id === lv2Id) {
      erreurs.push({ ligne: numeroLigne, message: "LV1 et LV2 doivent être différentes" });
      continue;
    }

    let utilisateurId: string | undefined;
    if (l.email) {
      const existantCompte = await prisma.utilisateur.findUnique({ where: { email: l.email } });
      if (existantCompte) {
        utilisateurId = existantCompte.id;
        if (!existantCompte.roles.includes("ELEVE")) {
          await prisma.utilisateur.update({
            where: { id: existantCompte.id },
            data: { roles: [...existantCompte.roles, "ELEVE"] },
          });
        }
      } else {
        const cree = await prisma.utilisateur.create({
          data: { email: l.email, password: await bcrypt.hash(MOT_DE_PASSE_DEFAUT, 12), nom, prenom, roles: ["ELEVE"] },
        });
        utilisateurId = cree.id;
      }
    }

    const existant = await prisma.eleve.findFirst({ where: { nom, prenom, classeId: classe.id } });
    if (existant) {
      await prisma.eleve.update({ where: { id: existant.id }, data: { lv1Id, lv2Id, utilisateurId } });
      misAJour++;
    } else {
      await prisma.eleve.create({ data: { nom, prenom, classeId: classe.id, lv1Id, lv2Id, utilisateurId } });
      crees++;
    }
  }

  return NextResponse.json({ total: lignes.length, crees, misAJour, erreurs });
}
