import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReferentsForm } from "@/components/admin/ReferentsForm";
import { ImportCsv } from "@/components/admin/ImportCsv";

export default async function ReferentsPage() {
  await requirePageSession(["ADMIN"]);

  const [referents, classes, disciplines, comptesExistants] = await Promise.all([
    prisma.professeurReferent.findMany({
      include: { utilisateur: true, discipline: true, classe: true },
      orderBy: [{ classe: { nom: "asc" } }, { discipline: { nom: "asc" } }, { utilisateur: { nom: "asc" } }],
    }),
    prisma.classe.findMany({
      include: { disciplines: { include: { discipline: true } } },
      orderBy: { nom: "asc" },
    }),
    prisma.discipline.findMany({ orderBy: { nom: "asc" } }),
    prisma.utilisateur.findMany({
      where: { roles: { has: "PROFESSEUR_REFERENT" } },
      select: { id: true, nom: true, prenom: true, email: true },
      orderBy: [{ nom: "asc" }],
    }),
  ]);

  // Un même référent peut intervenir dans plusieurs classes pour une même
  // discipline (une ligne ProfesseurReferent par classe) : regroupées ici
  // par (utilisateur, discipline) pour que la colonne "Classe" les affiche
  // toutes ensemble au lieu d'une ligne par classe.
  const groupesParCle = new Map<
    string,
    {
      cle: string;
      utilisateurId: string;
      nom: string;
      prenom: string;
      email: string;
      disciplineId: string;
      discipline: string;
      classes: { id: string; classeId: string; nom: string }[];
    }
  >();
  for (const r of referents) {
    const cle = `${r.utilisateurId}_${r.disciplineId}`;
    let g = groupesParCle.get(cle);
    if (!g) {
      g = {
        cle,
        utilisateurId: r.utilisateurId,
        nom: r.utilisateur.nom,
        prenom: r.utilisateur.prenom,
        email: r.utilisateur.email,
        disciplineId: r.disciplineId,
        discipline: r.discipline.nom,
        classes: [],
      };
      groupesParCle.set(cle, g);
    }
    g.classes.push({ id: r.id, classeId: r.classeId, nom: r.classe.nom });
  }

  return (
    <main className="container">
      <h1>Professeurs référents</h1>
      <ImportCsv
        endpoint="/api/admin/referents/import"
        colonnes="classe, discipline, nom, prenom, email"
        exemple={"classe,discipline,nom,prenom,email\nL1,Maths,Durand,Sophie,sophie.durand@exemple.fr"}
      />
      <ReferentsForm
        referentsInitiaux={[...groupesParCle.values()]}
        classes={classes.map((c) => ({
          id: c.id,
          nom: c.nom,
          disciplines: c.disciplines.map((cd) => ({ id: cd.discipline.id, nom: cd.discipline.nom })),
        }))}
        disciplines={disciplines.map((d) => ({ id: d.id, nom: d.nom }))}
        comptesExistants={comptesExistants}
      />
    </main>
  );
}
