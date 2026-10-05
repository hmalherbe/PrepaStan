import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ElevesForm } from "@/components/admin/ElevesForm";
import { ImportCsv } from "@/components/admin/ImportCsv";

export default async function ElevesPage() {
  await requirePageSession(["ADMIN"]);

  const [eleves, classes, languesVivantes, classeDisciplines] = await Promise.all([
    prisma.eleve.findMany({
      include: {
        classe: { select: { id: true, nom: true } },
        utilisateur: { select: { email: true } },
        lv1: { select: { id: true, nom: true } },
        lv2: { select: { id: true, nom: true } },
        dispenses: { select: { disciplineId: true, discipline: { select: { nom: true } } } },
      },
      orderBy: [{ classe: { nom: "asc" } }, { nom: "asc" }],
    }),
    prisma.classe.findMany({ orderBy: { nom: "asc" } }),
    prisma.discipline.findMany({ where: { estLangueVivante: true }, orderBy: { nom: "asc" } }),
    // Disciplines réellement pratiquées par chaque classe : sert à limiter
    // la liste des disciplines "dispensables" côté formulaire à celles que
    // la classe de l'élève pratique effectivement (pas de sens à dispenser
    // d'une discipline que la classe ne khôlle même pas).
    prisma.classeDiscipline.findMany({
      include: { discipline: { select: { id: true, nom: true } } },
      orderBy: { discipline: { nom: "asc" } },
    }),
  ]);
  const disciplinesParClasse = new Map<string, { id: string; nom: string }[]>();
  for (const cd of classeDisciplines) {
    const liste = disciplinesParClasse.get(cd.classeId) ?? [];
    liste.push(cd.discipline);
    disciplinesParClasse.set(cd.classeId, liste);
  }

  return (
    <main className="container">
      <h1>Étudiants</h1>
      <ImportCsv
        endpoint="/api/admin/eleves/import"
        colonnes="classe, nom, prenom, lv1, lv2, email, emailcontact, telephone, parcoursup, etablissement"
        exemple={
          "classe,nom,prenom,lv1,lv2,email,emailcontact,telephone,parcoursup,etablissement\n" +
          "L1,Dupont,Marie,Anglais,Espagnol,,marie.dupont@exemple.fr,0612345678,123456,Lycée X"
        }
      />
      <ElevesForm
        elevesInitiaux={eleves.map((e) => ({
          id: e.id,
          nom: e.nom,
          prenom: e.prenom,
          classeId: e.classeId,
          classe: e.classe.nom,
          lv1Id: e.lv1Id,
          lv1: e.lv1?.nom ?? null,
          lv2Id: e.lv2Id,
          lv2: e.lv2?.nom ?? null,
          disciplinesDispenseesIds: e.dispenses.map((d) => d.disciplineId),
          disciplinesDispensees: e.dispenses.map((d) => d.discipline.nom),
          aUnCompte: e.utilisateurId !== null,
          email: e.utilisateur?.email ?? null,
          emailContact: e.emailContact,
          telephone: e.telephone,
          numeroParcoursup: e.numeroParcoursup,
          etablissementOrigine: e.etablissementOrigine,
        }))}
        classes={classes.map((c) => ({ id: c.id, nom: c.nom }))}
        languesVivantes={languesVivantes.map((d) => ({ id: d.id, nom: d.nom }))}
        disciplinesParClasse={Object.fromEntries(disciplinesParClasse)}
      />
    </main>
  );
}
