import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PersonnesForm } from "@/components/admin/PersonnesForm";
import { ImportCsv } from "@/components/admin/ImportCsv";

export default async function PersonnesPage() {
  await requirePageSession(["ADMIN"]);

  const [utilisateurs, classes, disciplines] = await Promise.all([
    prisma.utilisateur.findMany({
      where: { roles: { hasSome: ["KHOLLEUR", "PROFESSEUR_REFERENT"] } },
      include: {
        competences: { include: { discipline: true } },
        referentsMatiere: { include: { classe: true, discipline: true } },
        _count: { select: { disponibilites: true } },
      },
      orderBy: [{ nom: "asc" }],
    }),
    prisma.classe.findMany({
      include: { disciplines: { include: { discipline: true } } },
      orderBy: { nom: "asc" },
    }),
    prisma.discipline.findMany({ orderBy: { nom: "asc" } }),
  ]);

  // Une personne khôlleur ET référent n'a qu'un seul compte Utilisateur :
  // une ligne par personne, avec ses deux rôles éventuels regroupés dans la
  // même grille plutôt que sur deux écrans séparés.
  const personnes = utilisateurs.map((u) => {
    const referentGroupesParDiscipline = new Map<
      string,
      { disciplineId: string; discipline: string; classes: { id: string; classeId: string; nom: string }[] }
    >();
    for (const r of u.referentsMatiere) {
      let g = referentGroupesParDiscipline.get(r.disciplineId);
      if (!g) {
        g = { disciplineId: r.disciplineId, discipline: r.discipline.nom, classes: [] };
        referentGroupesParDiscipline.set(r.disciplineId, g);
      }
      g.classes.push({ id: r.id, classeId: r.classeId, nom: r.classe.nom });
    }

    return {
      id: u.id,
      nom: u.nom,
      prenom: u.prenom,
      email: u.email,
      estKholleur: u.roles.includes("KHOLLEUR"),
      estReferent: u.roles.includes("PROFESSEUR_REFERENT"),
      disciplineIdsKholleur: u.competences.map((c) => c.disciplineId),
      disciplinesKholleur: u.competences.map((c) => c.discipline.nom),
      referentGroupes: [...referentGroupesParDiscipline.values()].sort((a, b) =>
        a.discipline.localeCompare(b.discipline)
      ),
      nbDisponibilites: u._count.disponibilites,
    };
  });

  return (
    <main className="container">
      <h1>Enseignants (khôlleurs et référents)</h1>
      <ImportCsv
        titre="Importer des khôlleurs depuis un fichier CSV"
        endpoint="/api/admin/kholleurs/import"
        colonnes="nom, prenom, email, disciplines"
        exemple={"nom,prenom,email,disciplines\nDurand,Sophie,sophie.durand@exemple.fr,Maths;Anglais"}
      />
      <ImportCsv
        titre="Importer des référents depuis un fichier CSV"
        endpoint="/api/admin/referents/import"
        colonnes="classe, discipline, nom, prenom, email"
        exemple={"classe,discipline,nom,prenom,email\nL1,Maths,Durand,Sophie,sophie.durand@exemple.fr"}
      />
      <PersonnesForm
        personnesInitiales={personnes}
        classes={classes.map((c) => ({
          id: c.id,
          nom: c.nom,
          disciplines: c.disciplines.map((cd) => ({ id: cd.discipline.id, nom: cd.discipline.nom })),
        }))}
        disciplines={disciplines.map((d) => ({ id: d.id, nom: d.nom }))}
      />
    </main>
  );
}
