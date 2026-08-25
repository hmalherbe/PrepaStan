import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Mot de passe commun à tous les comptes de démonstration (hors admin, qui
// garde son propre mécanisme via SEED_ADMIN_PASSWORD).
const MOT_DE_PASSE_DEMO = "demo1234";

async function upsertUtilisateur(
  email: string,
  nom: string,
  prenom: string,
  role: Role,
  motDePasseHash: string
) {
  return prisma.utilisateur.upsert({
    where: { email },
    update: {},
    create: { email, nom, prenom, role, password: motDePasseHash },
  });
}

async function upsertEleve(nom: string, prenom: string, classeId: string, utilisateurId?: string) {
  const existant = await prisma.eleve.findFirst({ where: { nom, prenom, classeId } });
  if (existant) return existant;
  return prisma.eleve.create({ data: { nom, prenom, classeId, utilisateurId } });
}

async function upsertDisponibilite(kholleurId: string, date: Date, heureDebut: string, heureFin: string) {
  const existante = await prisma.disponibilite.findFirst({ where: { kholleurId, date, heureDebut } });
  if (existante) return existante;
  return prisma.disponibilite.create({ data: { kholleurId, date, heureDebut, heureFin } });
}

// Un <input type="email"> rejette silencieusement la soumission du
// formulaire si la partie locale contient un caractère accentué (hors du
// jeu de caractères autorisé par la validation HTML5 email) : on retire
// donc les accents pour générer des adresses de démonstration valides.
function normaliserPourEmail(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Créneaux de 20 minutes consécutifs à partir de 14h00, pour répartir les
// élèves d'une session de démonstration (6 élèves -> 14h00 à 16h00).
function creneauHoraire(index: number): { heureDebut: string; heureFin: string } {
  const minutesDebut = index * 20;
  const minutesFin = minutesDebut + 20;
  const fmt = (m: number) => `${14 + Math.floor(m / 60)}:${(m % 60).toString().padStart(2, "0")}`;
  return { heureDebut: fmt(minutesDebut), heureFin: fmt(minutesFin) };
}

async function main() {
  // ---------- Compte admin ----------
  const emailAdmin = process.env.SEED_ADMIN_EMAIL ?? "admin@prepastan.local";
  const motDePasseAdmin = process.env.SEED_ADMIN_PASSWORD ?? "changeme";
  const admin = await upsertUtilisateur(
    emailAdmin,
    "Admin",
    "PrepaStan",
    "ADMIN",
    await bcrypt.hash(motDePasseAdmin, 12)
  );

  // ---------- Référentiel : classe, disciplines, salles ----------
  const classe = await prisma.classe.upsert({
    where: { nom_anneeScolaire: { nom: "MP2I-1", anneeScolaire: "2025-2026" } },
    update: {},
    create: { nom: "MP2I-1", anneeScolaire: "2025-2026" },
  });

  const [maths, physique, anglais] = await Promise.all(
    ["Mathématiques", "Physique-Chimie", "Anglais"].map((nom) =>
      prisma.discipline.upsert({ where: { nom }, update: {}, create: { nom } })
    )
  );

  const [salle101, salle102, salle103] = await Promise.all(
    ["Salle 101", "Salle 102", "Salle 103"].map((nom) =>
      prisma.salle.upsert({ where: { nom }, update: {}, create: { nom } })
    )
  );

  // ---------- Comptes de démonstration ----------
  const hashDemo = await bcrypt.hash(MOT_DE_PASSE_DEMO, 12);

  const kholleur1 = await upsertUtilisateur("kholleur.maths1@prepastan.local", "Bernard", "Claude", "KHOLLEUR", hashDemo);
  const kholleur2 = await upsertUtilisateur("kholleur.maths2@prepastan.local", "Roche", "Sophie", "KHOLLEUR", hashDemo);
  const kholleur3 = await upsertUtilisateur("kholleur.physique@prepastan.local", "Klein", "Marc", "KHOLLEUR", hashDemo);
  const kholleur4 = await upsertUtilisateur("kholleur.anglais@prepastan.local", "Faure", "Julie", "KHOLLEUR", hashDemo);

  const referentMaths = await upsertUtilisateur("referent.maths@prepastan.local", "Girard", "Nicolas", "PROFESSEUR_REFERENT", hashDemo);
  const referentPhysique = await upsertUtilisateur("referent.physique@prepastan.local", "Lambert", "Hélène", "PROFESSEUR_REFERENT", hashDemo);
  const referentAnglais = await upsertUtilisateur("referent.anglais@prepastan.local", "Petit", "Isabelle", "PROFESSEUR_REFERENT", hashDemo);

  for (const [kholleurId, disciplineId] of [
    [kholleur1.id, maths.id],
    [kholleur2.id, maths.id],
    [kholleur3.id, physique.id],
    [kholleur4.id, anglais.id],
  ]) {
    await prisma.competence.upsert({
      where: { kholleurId_disciplineId: { kholleurId, disciplineId } },
      update: {},
      create: { kholleurId, disciplineId },
    });
  }

  for (const disciplineId of [maths.id, physique.id, anglais.id]) {
    await prisma.classeDiscipline.upsert({
      where: { classeId_disciplineId: { classeId: classe.id, disciplineId } },
      update: {},
      create: { classeId: classe.id, disciplineId },
    });
  }

  await prisma.professeurReferent.upsert({
    where: { classeId_disciplineId: { classeId: classe.id, disciplineId: maths.id } },
    update: {},
    create: { utilisateurId: referentMaths.id, classeId: classe.id, disciplineId: maths.id },
  });
  await prisma.professeurReferent.upsert({
    where: { classeId_disciplineId: { classeId: classe.id, disciplineId: physique.id } },
    update: {},
    create: { utilisateurId: referentPhysique.id, classeId: classe.id, disciplineId: physique.id },
  });
  await prisma.professeurReferent.upsert({
    where: { classeId_disciplineId: { classeId: classe.id, disciplineId: anglais.id } },
    update: {},
    create: { utilisateurId: referentAnglais.id, classeId: classe.id, disciplineId: anglais.id },
  });

  // ---------- Élèves (comptes de connexion pour tous, même mot de passe démo) ----------
  const nomsEleves: [string, string][] = [
    ["Dupont", "Léa"],
    ["Martin", "Sacha"],
    ["Petit", "Robin"],
    ["Bernard", "Nora"],
    ["Girard", "Adam"],
    ["Roux", "Camille"],
  ];

  const eleves = [];
  for (const [nom, prenom] of nomsEleves) {
    const compte = await upsertUtilisateur(
      `${normaliserPourEmail(prenom)}.${normaliserPourEmail(nom)}@eleve.prepastan.local`,
      nom,
      prenom,
      "ELEVE",
      hashDemo
    );
    eleves.push(await upsertEleve(nom, prenom, classe.id, compte.id));
  }

  // ---------- Disponibilités pour une génération de planning en direct ----------
  // Semaine cible pour tester "Générer le planning" depuis l'écran admin
  // (nécessite le microservice OR-Tools lancé sur PLANNING_SOLVER_URL).
  const joursSemaine3 = ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27"].map((d) => new Date(d));
  await upsertDisponibilite(kholleur1.id, joursSemaine3[0], "14:00", "16:00"); // lundi
  await upsertDisponibilite(kholleur1.id, joursSemaine3[2], "14:00", "16:00"); // mercredi
  await upsertDisponibilite(kholleur2.id, joursSemaine3[1], "14:00", "16:00"); // mardi
  await upsertDisponibilite(kholleur2.id, joursSemaine3[3], "14:00", "16:00"); // jeudi
  await upsertDisponibilite(kholleur3.id, joursSemaine3[0], "16:00", "18:00");
  await upsertDisponibilite(kholleur3.id, joursSemaine3[2], "16:00", "18:00");
  await upsertDisponibilite(kholleur4.id, joursSemaine3[1], "16:00", "18:00");
  await upsertDisponibilite(kholleur4.id, joursSemaine3[3], "16:00", "18:00");

  // ---------- Semaine 1 (Mathématiques) : session déjà clôturée ----------
  // Pour voir immédiatement le résultat final (notes visibles côté élève)
  // sans avoir à rejouer tout le workflow.
  const sessionMaths = await prisma.sessionKholle.upsert({
    where: { classeId_disciplineId_semaine: { classeId: classe.id, disciplineId: maths.id, semaine: 1 } },
    update: {},
    create: {
      classeId: classe.id,
      disciplineId: maths.id,
      semaine: 1,
      dateDebut: new Date("2026-08-17"),
      dateFin: new Date("2026-08-17"),
      statut: "CLOTUREE",
    },
  });

  const notesMaths: [number, string][] = [
    [15, "Bonne maîtrise des méthodes, veiller à la rigueur de rédaction."],
    [11.5, "Résultats corrects mais manque d'assurance à l'oral."],
    [17, "Excellente prestation, raisonnement clair et bien mené."],
    [9, "Des lacunes sur le cours, à retravailler avant la prochaine khôlle."],
    [13.5, "Bonne participation, quelques erreurs de calcul."],
    [16, "Très solide, bon sens critique sur les résultats obtenus."],
  ];

  if ((await prisma.creneau.count({ where: { sessionKholleId: sessionMaths.id } })) === 0) {
    for (let i = 0; i < eleves.length; i++) {
      const { heureDebut, heureFin } = creneauHoraire(i);
      const creneau = await prisma.creneau.create({
        data: {
          sessionKholleId: sessionMaths.id,
          kholleurId: kholleur1.id,
          salleId: salle101.id,
          date: new Date("2026-08-17"),
          heureDebut,
          heureFin,
        },
      });
      const passage = await prisma.passage.create({
        data: { creneauId: creneau.id, eleveId: eleves[i].id, ordre: 0 },
      });
      const [valeur, appreciation] = notesMaths[i];
      await prisma.note.create({
        data: { passageId: passage.id, valeur, appreciation, dateSaisie: new Date("2026-08-17") },
      });
    }

    await prisma.validationGrille.create({
      data: {
        kholleurId: kholleur1.id,
        sessionKholleId: sessionMaths.id,
        statut: "VALIDE",
        dateValidation: new Date("2026-08-17"),
      },
    });
    await prisma.validationReferent.create({
      data: {
        sessionKholleId: sessionMaths.id,
        professeurReferentId: referentMaths.id,
        statut: "VALIDE",
        dateValidation: new Date("2026-08-18"),
      },
    });
  }

  // ---------- Semaine 2 (Anglais) : session planifiée, prête à noter ----------
  // Pour tester le workflow complet : connectez-vous en tant que kholleur
  // Anglais, saisissez les notes, validez, puis en tant que référent Anglais.
  const sessionAnglais = await prisma.sessionKholle.upsert({
    where: { classeId_disciplineId_semaine: { classeId: classe.id, disciplineId: anglais.id, semaine: 2 } },
    update: {},
    create: {
      classeId: classe.id,
      disciplineId: anglais.id,
      semaine: 2,
      dateDebut: new Date("2026-08-18"),
      dateFin: new Date("2026-08-18"),
      statut: "PLANIFIEE",
    },
  });

  if ((await prisma.creneau.count({ where: { sessionKholleId: sessionAnglais.id } })) === 0) {
    for (let i = 0; i < eleves.length; i++) {
      const { heureDebut, heureFin } = creneauHoraire(i);
      const creneau = await prisma.creneau.create({
        data: {
          sessionKholleId: sessionAnglais.id,
          kholleurId: kholleur4.id,
          salleId: salle102.id,
          date: new Date("2026-08-18"),
          heureDebut,
          heureFin,
        },
      });
      await prisma.passage.create({ data: { creneauId: creneau.id, eleveId: eleves[i].id, ordre: 0 } });
    }
  }

  console.log("\nJeu de données de démonstration prêt.\n");
  console.log(`Admin            : ${admin.email} / ${motDePasseAdmin}`);
  console.log(`Kholleur Maths 1 : ${kholleur1.email} / ${MOT_DE_PASSE_DEMO}`);
  console.log(`Kholleur Maths 2 : ${kholleur2.email} / ${MOT_DE_PASSE_DEMO}`);
  console.log(`Kholleur Physique: ${kholleur3.email} / ${MOT_DE_PASSE_DEMO}`);
  console.log(`Kholleur Anglais : ${kholleur4.email} / ${MOT_DE_PASSE_DEMO} (session semaine 2 à noter)`);
  console.log(`Référent Maths   : ${referentMaths.email} / ${MOT_DE_PASSE_DEMO}`);
  console.log(`Référent Physique: ${referentPhysique.email} / ${MOT_DE_PASSE_DEMO}`);
  console.log(`Référent Anglais : ${referentAnglais.email} / ${MOT_DE_PASSE_DEMO} (à valider une fois le kholleur passé)`);
  console.log(`Élèves           : ${nomsEleves.map(([n, p]) => `${normaliserPourEmail(p)}.${normaliserPourEmail(n)}@eleve.prepastan.local`).join(", ")}`);
  console.log(`                   mot de passe commun : ${MOT_DE_PASSE_DEMO}`);
  console.log(`\nPlanification en direct : disponibilités déjà saisies pour Maths/Physique/Anglais`);
  console.log(`du 24 au 27 août 2026 — dans l'écran admin, choisissez la classe MP2I-1, semaine 3.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
