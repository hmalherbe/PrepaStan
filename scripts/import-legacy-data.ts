// Import ponctuel des données de l'an dernier (classes L1/L2, disciplines,
// professeurs référents, khôlleurs, élèves avec LV1/LV2), extraites du
// Google Sheet qui servait de base de données à l'ancienne application
// Google Apps Script. Voir scripts/import-legacy-data.json (généré à partir
// du fichier Excel fourni par l'utilisateur, une ligne = une entrée source).
//
// Règles retenues (cf. échanges avec l'utilisateur) :
// - Plusieurs référents peuvent être assignés à la même (classe, discipline).
// - Une même personne peut cumuler les rôles KHOLLEUR et PROFESSEUR_REFERENT
//   sous un seul compte (identifié par son email) : les rôles sont fusionnés
//   au lieu de créer deux comptes.
// - Mot de passe par défaut "demo1234" pour tous les comptes créés par cet
//   import (jamais écrasé si le compte existe déjà).
//
// Idempotent : peut être relancé sans dupliquer (upserts partout).
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, type Role } from "@prisma/client";

const prisma = new PrismaClient();
const MOT_DE_PASSE_DEMO = "demo1234";

type Data = {
  anneeScolaire: string;
  disciplines: { nom: string; estLangueVivante: boolean }[];
  classes: string[];
  classeDisciplines: Record<string, string[]>;
  referents: { classe: string; discipline: string; nom: string; prenom: string; email: string }[];
  kholleurs: { discipline: string; nom: string; email: string }[];
  eleves: { classe: string; nom: string; prenom: string; lv1: string | null; lv2: string | null; email: string | null }[];
};

async function ajouterRole(email: string, nom: string, prenom: string, role: Role, motDePasseHash: string) {
  const existant = await prisma.utilisateur.findUnique({ where: { email } });
  if (existant) {
    if (!existant.roles.includes(role)) {
      await prisma.utilisateur.update({
        where: { id: existant.id },
        data: { roles: [...existant.roles, role] },
      });
    }
    return existant.id;
  }
  const cree = await prisma.utilisateur.create({
    data: { email, nom, prenom, roles: [role], password: motDePasseHash },
  });
  return cree.id;
}

async function main() {
  const data: Data = JSON.parse(readFileSync(join(__dirname, "import-legacy-data.json"), "utf-8"));
  const hashDemo = await bcrypt.hash(MOT_DE_PASSE_DEMO, 12);

  const anneeScolaire = await prisma.anneeScolaire.upsert({
    where: { libelle: data.anneeScolaire },
    update: {},
    create: { libelle: data.anneeScolaire },
  });

  const classes = new Map<string, string>();
  for (const nom of data.classes) {
    const classe = await prisma.classe.upsert({
      where: { nom_anneeScolaireId: { nom, anneeScolaireId: anneeScolaire.id } },
      update: {},
      create: { nom, anneeScolaireId: anneeScolaire.id },
    });
    classes.set(nom, classe.id);
  }

  const disciplines = new Map<string, string>();
  for (const d of data.disciplines) {
    const discipline = await prisma.discipline.upsert({
      where: { nom: d.nom },
      update: { estLangueVivante: d.estLangueVivante },
      create: { nom: d.nom, estLangueVivante: d.estLangueVivante },
    });
    disciplines.set(d.nom, discipline.id);
  }

  for (const [classeNom, disciplineNoms] of Object.entries(data.classeDisciplines)) {
    const classeId = classes.get(classeNom)!;
    for (const disciplineNom of disciplineNoms) {
      const disciplineId = disciplines.get(disciplineNom)!;
      await prisma.classeDiscipline.upsert({
        where: { classeId_disciplineId: { classeId, disciplineId } },
        update: {},
        create: { classeId, disciplineId },
      });
    }
  }

  let referentsCrees = 0;
  for (const r of data.referents) {
    const classeId = classes.get(r.classe);
    const disciplineId = disciplines.get(r.discipline);
    if (!classeId || !disciplineId) continue;
    const utilisateurId = await ajouterRole(r.email, r.nom, r.prenom, "PROFESSEUR_REFERENT", hashDemo);
    await prisma.professeurReferent.upsert({
      where: { classeId_disciplineId_utilisateurId: { classeId, disciplineId, utilisateurId } },
      update: {},
      create: { classeId, disciplineId, utilisateurId },
    });
    referentsCrees++;
  }

  // Le tableur des khôlleurs ne fournit pas de prénom.
  let kholleursCrees = 0;
  for (const k of data.kholleurs) {
    const disciplineId = disciplines.get(k.discipline);
    if (!disciplineId) continue;
    const kholleurId = await ajouterRole(k.email, k.nom, "", "KHOLLEUR", hashDemo);
    await prisma.competence.upsert({
      where: { kholleurId_disciplineId: { kholleurId, disciplineId } },
      update: {},
      create: { kholleurId, disciplineId },
    });
    kholleursCrees++;
  }

  let elevesCrees = 0;
  for (const e of data.eleves) {
    const classeId = classes.get(e.classe);
    if (!classeId) continue;
    const lv1Id = e.lv1 ? disciplines.get(e.lv1) ?? null : null;
    const lv2Id = e.lv2 ? disciplines.get(e.lv2) ?? null : null;

    let utilisateurId: string | undefined;
    if (e.email) {
      utilisateurId = await ajouterRole(e.email, e.nom, e.prenom, "ELEVE", hashDemo);
    }

    const existant = await prisma.eleve.findFirst({ where: { nom: e.nom, prenom: e.prenom, classeId } });
    if (existant) {
      await prisma.eleve.update({ where: { id: existant.id }, data: { lv1Id, lv2Id, utilisateurId } });
    } else {
      await prisma.eleve.create({
        data: { nom: e.nom, prenom: e.prenom, classeId, lv1Id, lv2Id, utilisateurId },
      });
    }
    elevesCrees++;
  }

  console.log(`Année scolaire : ${anneeScolaire.libelle}`);
  console.log(`Classes        : ${[...classes.keys()].join(", ")}`);
  console.log(`Disciplines    : ${[...disciplines.keys()].join(", ")}`);
  console.log(`Référents      : ${referentsCrees} assignations traitées`);
  console.log(`Khôlleurs      : ${kholleursCrees} traités`);
  console.log(`Élèves         : ${elevesCrees} traités`);
  console.log(`\nMot de passe commun pour tous les comptes créés par cet import : ${MOT_DE_PASSE_DEMO}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
